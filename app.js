// ===== 行囊 · 家庭共享攻略（Supabase 后端 + 实时同步）=====
// 攻略库 / 行程：共享（后端）。收藏：个人（本地）。

const LS_FAVS = "tg_favorites";
const loadFavs = () => { try { return JSON.parse(localStorage.getItem(LS_FAVS)) ?? []; } catch { return []; } };
const saveFavs = (v) => localStorage.setItem(LS_FAVS, JSON.stringify(v));

let guides = [];
let trips = [];
let favorites = loadFavs();
let activeTripId = null;
let activeTag = "全部";
let pendingPois = null;       // 加入行程暂存
let editingGuideId = null;    // 攻略编辑中的 id（null=新建）

const uid = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 9);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ===================== 启动 =====================
(async function boot() {
  bindStaticHandlers();
  const ok = DB.init();
  if (!ok) { showSetupBanner(); return; }
  setStatus("连接中…");
  try {
    await DB.seedGuidesIfEmpty(window.SEED_GUIDES || []);
    await refresh();
    DB.onChange(scheduleRefresh);
    setStatus("已同步");
  } catch (e) {
    console.error(e);
    setStatus("连接失败");
    showSetupBanner("连接后端出错，检查 config.js 的 URL/key 和 schema.sql 是否已执行。");
  }
})();

let refreshTimer = null;
function scheduleRefresh() {
  // 实时事件可能密集，去抖；正在输入时延后，避免打断
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.closest(".day-drop, .modal")) {
      scheduleRefresh();
      return;
    }
    await refresh();
  }, 400);
}

async function refresh() {
  [guides, trips] = await Promise.all([DB.listGuides(), DB.listTrips()]);
  if (!activeTripId && trips.length) activeTripId = trips[0].id;
  if (activeTripId && !trips.find((t) => t.id === activeTripId)) activeTripId = trips[0]?.id || null;
  const tab = $(".tab-btn.active")?.dataset.tab || "guides";
  renderTagChips();
  renderGuides();
  if (tab === "trips") renderTrips();
  updateFavCount();
  setStatus("已同步 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
}

function setStatus(t) { const e = $("#syncStatus"); if (e) e.textContent = t; }
function showSetupBanner(msg) {
  const b = $("#setupBanner");
  if (!b) return;
  b.style.display = "block";
  if (msg) $("#setupMsg").textContent = msg;
}

// ===================== Tab =====================
function bindStaticHandlers() {
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#guideSearch").addEventListener("input", renderGuides);
  $("#newTripBtn").onclick = openNewTrip;
  $("#delTripBtn").onclick = deleteActiveTrip;
  $("#tripSelect").onchange = (e) => { activeTripId = e.target.value; renderDays(); };
  $("#newGuideBtn").onclick = () => openGuideEditor(null);

  $("#ntCancel").onclick = () => $("#newTripModal").classList.remove("open");
  $("#ntCreate").onclick = createTrip;
  $("#pdCancel").onclick = () => $("#pickDayModal").classList.remove("open");
  $("#pdConfirm").onclick = confirmPickDay;
  $("#geCancel").onclick = () => $("#guideEditModal").classList.remove("open");
  $("#geSave").onclick = saveGuide;
  $("#geAddPoi").onclick = () => addPoiRow();
}
function switchTab(tab) {
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + tab).classList.add("active");
  if (tab === "trips") renderTrips();
}

// ===================== 攻略库 =====================
function allTags() {
  const set = new Set(["全部"]);
  guides.forEach((g) => (g.tags || []).forEach((t) => set.add(t)));
  return Array.from(set);
}
function renderTagChips() {
  const wrap = $("#tagChips");
  wrap.innerHTML = "";
  allTags().forEach((t) => {
    const c = document.createElement("button");
    c.className = "chip" + (t === activeTag ? " active" : "");
    c.textContent = t;
    c.onclick = () => { activeTag = t; renderTagChips(); renderGuides(); };
    wrap.appendChild(c);
  });
}
function renderGuides() {
  const q = $("#guideSearch").value.trim().toLowerCase();
  const grid = $("#guideGrid");
  grid.innerHTML = "";
  const matches = guides.filter((g) => {
    const tags = g.tags || [];
    const tagOk = activeTag === "全部" || tags.includes(activeTag);
    if (!tagOk) return false;
    if (!q) return true;
    const hay = [g.dest, g.title, g.summary, tags.join(" "),
      (g.pois || []).map((p) => p.name + (p.desc || "")).join(" ")].join(" ").toLowerCase();
    return hay.includes(q);
  });
  if (!matches.length) {
    grid.innerHTML = `<p class="empty">没有匹配的攻略。换个关键词，或点右上「+ 新建攻略」自己加一份。</p>`;
    return;
  }
  matches.forEach((g) => grid.appendChild(guideCard(g)));
  updateFavCount();
}
function guideCard(g) {
  const card = document.createElement("div");
  card.className = "guide-card";
  const isFav = favorites.includes(g.id);
  const tags = g.tags || [];
  const pois = g.pois || [];
  const poiItems = pois.map((p) => `
    <li class="poi-item">
      <span class="type">${esc(p.type)}</span>
      <span class="pname">${esc(p.name)}</span>
      <button class="add-poi" title="加入行程" data-poi="${esc(p.id)}">+</button>
    </li>`).join("");
  card.innerHTML = `
    <div class="gc-top">
      <div><div class="dest">${esc(g.dest)}</div><h3>${esc(g.title)}</h3></div>
      <div class="meta">${g.days || "?"} 天 · ${esc(g.season || "")}</div>
    </div>
    <div class="summary">${esc(g.summary || "")}</div>
    <div class="tag-row">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <ul class="poi-list">${poiItems || '<li class="empty" style="padding:8px">还没景点，点「编辑」加</li>'}</ul>
    <div class="gc-actions">
      <button class="btn fav ${isFav ? "on" : ""}" data-fav>${isFav ? "♥ 已收藏" : "♡ 收藏"}</button>
      <button class="btn primary" data-addall>整份加入行程</button>
      <button class="btn" data-edit>编辑</button>
      <button class="btn" data-del title="删除攻略">🗑</button>
    </div>`;
  card.querySelector("[data-fav]").onclick = () => toggleFav(g.id);
  card.querySelector("[data-addall]").onclick = () => openPickDay(pois.map(clonePoi), g.title);
  card.querySelector("[data-edit]").onclick = () => openGuideEditor(g.id);
  card.querySelector("[data-del]").onclick = () => deleteGuide(g.id, g.title);
  card.querySelectorAll(".add-poi").forEach((btn) => {
    btn.onclick = () => {
      const poi = pois.find((p) => p.id === btn.dataset.poi);
      openPickDay([clonePoi(poi)], poi.name);
    };
  });
  return card;
}
function clonePoi(p) {
  return { uid: uid("tp"), name: p.name, type: p.type, time: "", note: p.desc || "" };
}
function toggleFav(id) {
  favorites = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
  saveFavs(favorites);
  renderGuides();
}
function updateFavCount() {
  $("#favCount").textContent = favorites.length ? `♥ 收藏 ${favorites.length}` : "";
}
async function deleteGuide(id, title) {
  if (!confirm(`删除共享攻略「${title}」？全家都会看不到，此操作不可恢复。`)) return;
  try { await DB.deleteGuide(id); await refresh(); }
  catch (e) { alert("删除失败：" + e.message); }
}

// ===================== 攻略编辑器 =====================
function openGuideEditor(id) {
  editingGuideId = id;
  const g = id ? guides.find((x) => x.id === id) : null;
  $("#geTitle").textContent = id ? "编辑攻略" : "新建攻略";
  $("#geDest").value = g?.dest || "";
  $("#geName").value = g?.title || "";
  $("#geDays").value = g?.days || 3;
  $("#geSeason").value = g?.season || "";
  $("#geTags").value = (g?.tags || []).join("、");
  $("#geSummary").value = g?.summary || "";
  const list = $("#gePoiList");
  list.innerHTML = "";
  (g?.pois || []).forEach((p) => addPoiRow(p));
  if (!g?.pois?.length) addPoiRow();
  $("#guideEditModal").classList.add("open");
}
function addPoiRow(p = {}) {
  const row = document.createElement("div");
  row.className = "ge-poi-row";
  row.innerHTML = `
    <input class="ge-p-name" placeholder="景点/美食名" value="${esc(p.name || "")}" />
    <select class="ge-p-type">
      ${["景点", "美食", "住宿", "活动", "自定义"].map((t) =>
        `<option ${p.type === t ? "selected" : ""}>${t}</option>`).join("")}
    </select>
    <input class="ge-p-area" placeholder="区域" value="${esc(p.area || "")}" />
    <input class="ge-p-dur" placeholder="时长" value="${esc(p.duration || "")}" />
    <input class="ge-p-desc" placeholder="贴士/备注" value="${esc(p.desc || "")}" />
    <button class="ge-p-del" title="删除">✕</button>`;
  row.querySelector(".ge-p-del").onclick = () => row.remove();
  $("#gePoiList").appendChild(row);
}
async function saveGuide() {
  const dest = $("#geDest").value.trim();
  const title = $("#geName").value.trim();
  if (!dest || !title) { alert("目的地和标题必填"); return; }
  const tags = $("#geTags").value.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
  const pois = $$("#gePoiList .ge-poi-row").map((r) => {
    const name = r.querySelector(".ge-p-name").value.trim();
    if (!name) return null;
    return {
      id: uid("p"),
      name,
      type: r.querySelector(".ge-p-type").value,
      area: r.querySelector(".ge-p-area").value.trim(),
      duration: r.querySelector(".ge-p-dur").value.trim(),
      desc: r.querySelector(".ge-p-desc").value.trim(),
    };
  }).filter(Boolean);
  const g = {
    id: editingGuideId || uid("g"),
    dest, title,
    days: Math.max(1, +$("#geDays").value || 1),
    season: $("#geSeason").value.trim(),
    tags, summary: $("#geSummary").value.trim(),
    pois,
  };
  try {
    await DB.upsertGuide(g);
    $("#guideEditModal").classList.remove("open");
    await refresh();
  } catch (e) { alert("保存失败：" + e.message); }
}

// ===================== 加入行程 =====================
function openPickDay(pois, label) {
  if (!trips.length) { alert("还没有行程，先去「我的行程」新建一个。"); switchTab("trips"); return; }
  pendingPois = pois;
  $("#pdTitle").textContent = "加入：" + label;
  const sel = $("#pdTrip");
  sel.innerHTML = trips.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  sel.value = activeTripId || trips[0].id;
  fillDayOptions(sel.value);
  sel.onchange = () => fillDayOptions(sel.value);
  $("#pickDayModal").classList.add("open");
}
function fillDayOptions(tripId) {
  const t = trips.find((x) => x.id === tripId);
  $("#pdDay").innerHTML = (t.days || []).map((_, i) => `<option value="${i}">第 ${i + 1} 天</option>`).join("");
}
async function confirmPickDay() {
  const t = trips.find((x) => x.id === $("#pdTrip").value);
  const dayIdx = +$("#pdDay").value;
  t.days[dayIdx].pois.push(...pendingPois);
  activeTripId = t.id;
  $("#pickDayModal").classList.remove("open");
  try { await DB.upsertTrip(t); await refresh(); switchTab("trips"); }
  catch (e) { alert("保存失败：" + e.message); }
}

// ===================== 行程 =====================
function renderTrips() { renderTripSelect(); renderDays(); }
function renderTripSelect() {
  const sel = $("#tripSelect");
  if (!trips.length) { sel.innerHTML = `<option>（还没有行程）</option>`; return; }
  sel.innerHTML = trips.map((t) => `<option value="${t.id}">${esc(t.name)} · ${esc(t.dest || "")}</option>`).join("");
  if (activeTripId) sel.value = activeTripId;
}
function renderDays() {
  const wrap = $("#daysWrap");
  const t = trips.find((x) => x.id === activeTripId);
  if (!t) { wrap.innerHTML = `<p class="empty">还没有行程。点「+ 新建行程」开始（全家共享）。</p>`; return; }
  wrap.innerHTML = "";
  (t.days || []).forEach((day, di) => wrap.appendChild(dayColumn(t, day, di)));
}
function dayColumn(trip, day, di) {
  const col = document.createElement("div");
  col.className = "day-col";
  col.innerHTML = `<h4>第 ${di + 1} 天 <button class="add-day-poi">+ 自定义</button></h4>
                   <div class="day-drop" data-day="${di}"></div>`;
  const drop = col.querySelector(".day-drop");
  if (!day.pois.length) drop.innerHTML = `<p class="empty">空，拖卡片到这里</p>`;
  else day.pois.forEach((p) => drop.appendChild(tripPoiCard(trip, di, p)));

  col.querySelector(".add-day-poi").onclick = async () => {
    const name = prompt("景点 / 活动名称：");
    if (!name) return;
    day.pois.push({ uid: uid("tp"), name, type: "自定义", time: "", note: "" });
    try { await DB.upsertTrip(trip); await refresh(); } catch (e) { alert(e.message); }
  };
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("dragover"); handleDrop(trip, di, e); });
  return col;
}
function tripPoiCard(trip, dayIdx, poi) {
  const el = document.createElement("div");
  el.className = "trip-poi";
  el.draggable = true;
  el.dataset.uid = poi.uid;
  el.innerHTML = `
    <div class="tp-top">
      <span class="type">${esc(poi.type)}</span>
      <span class="pname">${esc(poi.name)}</span>
      <button class="del" title="删除">✕</button>
    </div>
    <input class="tp-time" placeholder="时间 如 09:00" value="${esc(poi.time || "")}" />
    <textarea class="tp-note" placeholder="备注…">${esc(poi.note || "")}</textarea>`;
  el.querySelector(".del").onclick = async () => {
    trip.days[dayIdx].pois = trip.days[dayIdx].pois.filter((p) => p.uid !== poi.uid);
    try { await DB.upsertTrip(trip); await refresh(); } catch (e) { alert(e.message); }
  };
  el.querySelector(".tp-time").onchange = async (e) => { poi.time = e.target.value; try { await DB.upsertTrip(trip); } catch (er) { alert(er.message); } };
  el.querySelector(".tp-note").onchange = async (e) => { poi.note = e.target.value; try { await DB.upsertTrip(trip); } catch (er) { alert(er.message); } };
  el.addEventListener("dragstart", (e) => { el.classList.add("dragging"); e.dataTransfer.setData("text/plain", JSON.stringify({ uid: poi.uid, fromDay: dayIdx })); });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  return el;
}
async function handleDrop(trip, toDay, e) {
  let payload;
  try { payload = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
  const fromArr = trip.days[payload.fromDay].pois;
  const idx = fromArr.findIndex((p) => p.uid === payload.uid);
  if (idx < 0) return;
  const [moved] = fromArr.splice(idx, 1);
  const drop = e.currentTarget;
  const after = [...drop.querySelectorAll(".trip-poi:not(.dragging)")].find((c) => {
    const box = c.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2;
  });
  const toArr = trip.days[toDay].pois;
  if (!after) toArr.push(moved);
  else {
    const insertIdx = toArr.findIndex((p) => p.uid === after.dataset.uid);
    toArr.splice(insertIdx < 0 ? toArr.length : insertIdx, 0, moved);
  }
  try { await DB.upsertTrip(trip); await refresh(); } catch (er) { alert(er.message); }
}

// ---- 新建 / 删除行程 ----
function openNewTrip() {
  $("#ntName").value = ""; $("#ntDest").value = ""; $("#ntDays").value = 3;
  $("#newTripModal").classList.add("open");
}
async function createTrip() {
  const name = $("#ntName").value.trim() || "未命名行程";
  const dest = $("#ntDest").value.trim() || "—";
  const n = Math.max(1, Math.min(30, +$("#ntDays").value || 3));
  const trip = { id: uid("trip"), name, dest, days: Array.from({ length: n }, () => ({ pois: [] })) };
  activeTripId = trip.id;
  $("#newTripModal").classList.remove("open");
  try { await DB.upsertTrip(trip); await refresh(); switchTab("trips"); }
  catch (e) { alert("创建失败：" + e.message); }
}
async function deleteActiveTrip() {
  const t = trips.find((x) => x.id === activeTripId);
  if (!t) return;
  if (!confirm(`删除共享行程「${t.name}」？全家都会看不到。`)) return;
  try { await DB.deleteTrip(t.id); activeTripId = null; await refresh(); }
  catch (e) { alert("删除失败：" + e.message); }
}

// ---- 工具 ----
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
