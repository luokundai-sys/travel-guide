// ===== 行囊 · 选城市→勾景点美食→生成最优路线→存家庭共享 =====
// 景点/美食：高德 JS API 实时拉取。路线：按坐标就近排序+分天。行程：存 Supabase 共享。

let amap = null;
let foundAttr = [];      // [{name,lng,lat,type,address,rating}]
let foundFood = [];
let lastRoute = null;    // 生成后的 {city, days:[[poi...]]}
let savedTrips = [];
let activeSavedId = null;
let map = null;
let curCity = "";

const PRESETS = ["成都", "西安", "大理", "北京", "上海", "杭州", "重庆", "厦门", "丽江", "青岛"];
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- 启动 ----------
(async function boot() {
  renderPresets();
  bind();
  const okDB = DB.init();
  if (!okDB) { showSetup("Supabase 没配好。"); }
  try { amap = await loadAMap(); } catch { showSetup("高德地图加载失败，检查 key / 域名白名单。"); }

  if (okDB) {
    setStatus("连接中…");
    try {
      await refreshSaved();
      DB.onChange(scheduleRefresh);
      setStatus("已同步");
    } catch (e) { console.error(e); setStatus("连接失败"); }
  }
})();

function loadAMap() {
  return new Promise((resolve, reject) => {
    if (!window.AMAP_KEY || window.AMAP_KEY.includes("YOUR_")) return reject(new Error("no amap key"));
    window._AMapSecurityConfig = { securityJsCode: window.AMAP_JSCODE };
    const s = document.createElement("script");
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${window.AMAP_KEY}&plugin=AMap.PlaceSearch`;
    s.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error("AMap missing"));
    s.onerror = () => reject(new Error("amap load error"));
    document.head.appendChild(s);
  });
}

function setStatus(t) { const e = $("#syncStatus"); if (e) e.textContent = t; }
function showSetup(msg) { const b = $("#setupBanner"); if (b) { b.style.display = "block"; if (msg) $("#setupMsg").textContent = msg; } }

let rTimer = null;
function scheduleRefresh() { clearTimeout(rTimer); rTimer = setTimeout(refreshSaved, 400); }

// ---------- 绑定 ----------
function bind() {
  $("#searchBtn").onclick = () => doSearch($("#cityInput").value.trim());
  $("#cityInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch($("#cityInput").value.trim()); });
  $("#genBtn").onclick = generateRoute;
  $("#saveBtn").onclick = saveRoute;
  $("#savedSelect").onchange = (e) => { activeSavedId = e.target.value; renderSavedDays(); };
  $("#delSaved").onclick = deleteSaved;
}
function renderPresets() {
  const wrap = $("#presets");
  wrap.innerHTML = "";
  PRESETS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = c;
    b.onclick = () => { $("#cityInput").value = c; doSearch(c); };
    wrap.appendChild(b);
  });
}

// ---------- ① 搜景点/美食 ----------
function searchPOI(city, keyword, type, count) {
  return new Promise((resolve) => {
    if (!amap) return resolve([]);
    const ps = new amap.PlaceSearch({ city, citylimit: true, pageSize: count, pageIndex: 1, type, extensions: "all" });
    ps.search(keyword, (status, result) => {
      const pois = (status === "complete" && result.poiList && result.poiList.pois) ? result.poiList.pois : [];
      resolve(pois.map((p) => ({
        name: p.name,
        lng: p.location && p.location.lng,
        lat: p.location && p.location.lat,
        address: p.address || (p.pname || "") + (p.adname || ""),
        rating: p.rating || (p.biz_ext && p.biz_ext.rating) || "",
      })).filter((p) => p.lng && p.lat));
    });
  });
}

async function doSearch(city) {
  if (!city) { alert("先输入城市"); return; }
  if (!amap) { alert("高德还没加载好，稍等或刷新"); return; }
  curCity = city;
  $("#pickCard").style.display = "";
  $("#routeCard").style.display = "none";
  $("#loading").style.display = "";
  $("#attrList").innerHTML = ""; $("#foodList").innerHTML = "";
  $("#tripName").value = city + "行程";

  const [attr, food] = await Promise.all([
    searchPOI(city, "景点", "风景名胜|公园广场", 18),
    searchPOI(city, "美食", "餐饮服务", 12),
  ]);
  foundAttr = attr; foundFood = food;
  $("#loading").style.display = "none";
  renderChecks("#attrList", attr, "景点");
  renderChecks("#foodList", food, "美食");
  if (!attr.length && !food.length) $("#attrList").innerHTML = `<p class="empty">没搜到，换个城市名试试</p>`;
}

function renderChecks(sel, list, kind) {
  const box = $(sel);
  box.innerHTML = "";
  list.forEach((p, i) => {
    const id = kind + "-" + i;
    const row = document.createElement("label");
    row.className = "chk";
    row.innerHTML = `<input type="checkbox" data-kind="${kind}" data-i="${i}" />
      <span class="chk-name">${esc(p.name)}</span>
      <small>${p.rating ? "★" + esc(p.rating) + " · " : ""}${esc(p.address || "")}</small>`;
    box.appendChild(row);
  });
}

// ---------- ③ 生成路线 ----------
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function nearestOrder(pois) {
  if (pois.length <= 2) return pois.slice();
  const left = pois.slice(), out = [left.shift()];
  while (left.length) {
    const last = out[out.length - 1];
    let bi = 0, bd = Infinity;
    left.forEach((p, i) => { const d = haversine(last, p); if (d < bd) { bd = d; bi = i; } });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}
function splitDays(ordered, n) {
  n = Math.max(1, Math.min(n, ordered.length));
  const days = Array.from({ length: n }, () => []);
  const per = Math.ceil(ordered.length / n);
  ordered.forEach((p, i) => days[Math.min(n - 1, Math.floor(i / per))].push(p));
  return days;
}

function generateRoute() {
  const picked = [];
  $$('#attrList input:checked, #foodList input:checked').forEach((cb) => {
    const arr = cb.dataset.kind === "景点" ? foundAttr : foundFood;
    const p = arr[+cb.dataset.i];
    if (p) picked.push({ ...p, type: cb.dataset.kind });
  });
  if (picked.length < 2) { alert("至少勾 2 个，才能排路线"); return; }
  const n = Math.max(1, Math.min(15, +$("#daysInput").value || 3));
  const days = splitDays(nearestOrder(picked), n);
  lastRoute = { city: curCity, days };
  $("#routeCard").style.display = "";
  drawMap(days);
  renderRouteList(days);
  $("#routeCard").scrollIntoView({ behavior: "smooth" });
}

function drawMap(days) {
  if (!amap) return;
  if (!map) map = new amap.Map("mapBox", { zoom: 11 });
  map.clearMap();
  const path = [];
  let idx = 0;
  const colors = ["#2f7d5b", "#e8553a", "#2d6cdf", "#b8860b", "#7d3cad"];
  days.forEach((day, di) => {
    day.forEach((p) => {
      idx++;
      const pos = [p.lng, p.lat];
      path.push(pos);
      new amap.Marker({
        position: pos, map,
        content: `<div class="map-pin" style="background:${colors[di % colors.length]}">${idx}</div>`,
        offset: new amap.Pixel(-12, -12),
      });
    });
  });
  if (path.length > 1) new amap.Polyline({ path, map, strokeColor: "#2f7d5b", strokeWeight: 4, strokeOpacity: 0.7 });
  map.setFitView();
}

function renderRouteList(days) {
  const box = $("#routeList");
  box.innerHTML = "";
  let idx = 0;
  days.forEach((day, di) => {
    const col = document.createElement("div");
    col.className = "route-day";
    col.innerHTML = `<h4>第 ${di + 1} 天</h4>`;
    day.forEach((p) => {
      idx++;
      const item = document.createElement("div");
      item.className = "route-item";
      item.innerHTML = `<span class="ord">${idx}</span>
        <span class="ri-name"><span class="type">${esc(p.type)}</span> ${esc(p.name)}</span>
        <small>${esc(p.address || "")}</small>`;
      col.appendChild(item);
    });
    box.appendChild(col);
  });
}

// ---------- ④ 存为家庭行程 ----------
async function saveRoute() {
  if (!lastRoute) return;
  if (!DB.isConfigured()) { alert("Supabase 没配好，存不了"); return; }
  const name = $("#tripName").value.trim() || (lastRoute.city + "行程");
  const trip = {
    id: uid("trip"),
    name, dest: lastRoute.city,
    days: lastRoute.days.map((day) => ({
      pois: day.map((p) => ({ uid: uid("tp"), name: p.name, type: p.type, time: "", note: p.address || "", lng: p.lng, lat: p.lat })),
    })),
  };
  try {
    await DB.upsertTrip(trip);
    activeSavedId = trip.id;
    await refreshSaved();
    alert("已存，全家可见 ✓");
  } catch (e) { alert("保存失败：" + e.message); }
}

// ---------- 共享行程 ----------
async function refreshSaved() {
  savedTrips = await DB.listTrips();
  if (!activeSavedId && savedTrips.length) activeSavedId = savedTrips[savedTrips.length - 1].id;
  if (activeSavedId && !savedTrips.find((t) => t.id === activeSavedId)) activeSavedId = savedTrips[savedTrips.length - 1]?.id || null;
  renderSavedSelect();
  renderSavedDays();
  setStatus("已同步 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
}
function renderSavedSelect() {
  const sel = $("#savedSelect");
  if (!savedTrips.length) { sel.innerHTML = `<option>（还没有共享行程）</option>`; return; }
  sel.innerHTML = savedTrips.map((t) => `<option value="${t.id}">${esc(t.name)} · ${esc(t.dest || "")}</option>`).join("");
  if (activeSavedId) sel.value = activeSavedId;
}
function renderSavedDays() {
  const wrap = $("#savedDays");
  const t = savedTrips.find((x) => x.id === activeSavedId);
  if (!t) { wrap.innerHTML = `<p class="empty">还没有共享行程。上面生成一条，点「存为家庭行程」。</p>`; return; }
  wrap.innerHTML = "";
  let idx = 0;
  (t.days || []).forEach((day, di) => {
    const col = document.createElement("div");
    col.className = "day-col";
    col.innerHTML = `<h4>第 ${di + 1} 天</h4>`;
    (day.pois || []).forEach((p) => {
      idx++;
      const it = document.createElement("div");
      it.className = "route-item";
      it.innerHTML = `<span class="ord">${idx}</span><span class="ri-name"><span class="type">${esc(p.type)}</span> ${esc(p.name)}</span><small>${esc(p.note || "")}</small>`;
      col.appendChild(it);
    });
    if (!(day.pois || []).length) col.innerHTML += `<p class="empty">空</p>`;
    wrap.appendChild(col);
  });
}
async function deleteSaved() {
  const t = savedTrips.find((x) => x.id === activeSavedId);
  if (!t) return;
  if (!confirm(`删除共享行程「${t.name}」？全家都会看不到。`)) return;
  try { await DB.deleteTrip(t.id); activeSavedId = null; await refreshSaved(); }
  catch (e) { alert("删除失败：" + e.message); }
}
