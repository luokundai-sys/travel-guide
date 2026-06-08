// ===== 行囊 · 选城市→勾景点美食→生成最优路线→存家庭共享 =====
// 景点/美食：高德 JS API 实时拉取。路线：按坐标就近排序+分天。行程：存 Supabase 共享。

let amap = null;
let foundAttr = [];      // [{name,lng,lat,type,address,rating}]
let foundFood = [];
let lastRoute = null;    // 生成后的 {city, days:[[poi...]]}
let savedTrips = [];
let activeSavedId = null;
let map = null;        // Leaflet 地图实例
let mapLayer = null;   // 当前路线图层组
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
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${window.AMAP_KEY}&plugin=AMap.PlaceSearch,AMap.Geocoder`;
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
  $("#genFromText").onclick = generateFromText;
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

// ---------- 坐标系 GCJ-02 → WGS-84（高德是 GCJ-02，Leaflet/OSM 是 WGS-84）----------
const PI = Math.PI, A_AXIS = 6378245.0, EE = 0.00669342162296594323;
function outOfChina(lng, lat) { return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55); }
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return r;
}
function gcj2wgs(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
  const rad = lat / 180 * PI;
  let magic = Math.sin(rad); magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / ((A_AXIS * (1 - EE)) / (magic * sq) * PI);
  dLng = (dLng * 180) / (A_AXIS / sq * Math.cos(rad) * PI);
  return [lng * 2 - (lng + dLng), lat * 2 - (lat + dLat)];
}
const httpsify = (u) => String(u || "").replace(/^http:\/\//, "https://");

// ---------- ① 搜景点/美食（高德，带图片+评分）----------
function searchPOI(city, keyword, type, count) {
  return new Promise((resolve) => {
    if (!amap) return resolve([]);
    const ps = new amap.PlaceSearch({ city, citylimit: true, pageSize: count, pageIndex: 1, type, extensions: "all" });
    ps.search(keyword, (status, result) => {
      const pois = (status === "complete" && result.poiList && result.poiList.pois) ? result.poiList.pois : [];
      resolve(pois.map((p) => {
        const [lng, lat] = (p.location) ? gcj2wgs(p.location.lng, p.location.lat) : [null, null];
        return {
          name: p.name, lng, lat,
          city: p.cityname || p.adname || p.pname || "",
          address: p.address || (p.pname || "") + (p.adname || ""),
          rating: p.rating || (p.biz_ext && p.biz_ext.rating) || "",
          photo: (p.photos && p.photos[0] && httpsify(p.photos[0].url)) || "",
        };
      }).filter((p) => p.lng && p.lat));
    });
  });
}

// ---------- ①' 海外城市：OSM/Overpass 列景点 + 维基百科配图 ----------
function pickName(t) { return t["name:zh"] || t["name:en"] || t.name || ""; }

const CITY_TYPES = ["city", "town", "municipality", "administrative", "county", "state", "province", "village", "suburb"];
async function osmCityQuery(query) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=zh,en&q=${encodeURIComponent(query)}`);
    const j = await r.json();
    if (!j || !j.length) return null;
    return { admin: j.find((x) => CITY_TYPES.includes(x.addresstype)) || j.find((x) => x.class === "boundary"), first: j[0] };
  } catch (e) { return null; }
}
async function osmGeocodeFull(q) {
  // 优先命中行政区/城市。裸名（如「京都」）常只匹配到同名车站 → 补「市」/「 city」再试一次
  let res = await osmCityQuery(q);
  if (res && res.admin) return res.admin;
  const alt = /[一-鿿]/.test(q) ? q.replace(/[市区]$/, "") + "市" : q + " city";
  if (alt !== q) {
    await sleep(1100); // 遵守 Nominatim ≤1 req/s
    const r2 = await osmCityQuery(alt);
    if (r2 && r2.admin) return r2.admin;
  }
  return (res && res.first) || null;
}

async function overpass(query) {
  const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (const ep of eps) {
    try {
      const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(query) });
      if (!r.ok) continue;
      return (await r.json()).elements || [];
    } catch (e) { /* 换下一个端点 */ }
  }
  return [];
}

// 用 OSM 标签里的 wikipedia / name 去维基百科取缩略图 + 一句简介（优先中文）
async function wikiInfo(t) {
  const cands = [];
  if (t["name:zh"]) cands.push(["zh", t["name:zh"]]);
  if (t.wikipedia && t.wikipedia.includes(":")) { const i = t.wikipedia.indexOf(":"); cands.push([t.wikipedia.slice(0, i), t.wikipedia.slice(i + 1)]); }
  else if (t["name:en"]) cands.push(["en", t["name:en"]]);
  for (const [lang, title] of cands.slice(0, 2)) {
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.thumbnail && j.thumbnail.source) return { photo: j.thumbnail.source, desc: j.description || "" };
    } catch (e) { /* 试下一个 */ }
  }
  return { photo: "", desc: "" };
}

async function overseasSearch(city) {
  const geo = await osmGeocodeFull(city);
  if (!geo || !geo.boundingbox) return { attr: [] };
  const [s, n, w, e] = geo.boundingbox.map(Number);
  const q = `[out:json][timeout:25];(
    nwr["tourism"~"attraction|museum|viewpoint|gallery|zoo|theme_park|artwork"]["wikidata"](${s},${w},${n},${e});
    nwr["historic"~"castle|monument|memorial|ruins|temple|shrine|archaeological_site|monastery"]["wikidata"](${s},${w},${n},${e});
  );out center 80;`;
  const els = await overpass(q);
  const seen = new Set(), list = [];
  for (const el of els) {
    const t = el.tags || {}, name = pickName(t);
    if (!name || seen.has(name)) continue;
    const lat = el.lat ?? (el.center && el.center.lat), lng = el.lon ?? (el.center && el.center.lon);
    if (lat == null || lng == null) continue;
    seen.add(name);
    list.push({ name, lat, lng, t });
  }
  // 有中/英文名的（更广为人知）排前面
  list.sort((a, b) => (a.t["name:zh"] || a.t["name:en"] ? 0 : 1) - (b.t["name:zh"] || b.t["name:en"] ? 0 : 1));
  const top = list.slice(0, 16);
  await Promise.all(top.map(async (it) => { const wi = await wikiInfo(it.t); it.photo = wi.photo; it.desc = wi.desc; }));
  return { attr: top.map((it) => ({ name: it.name, lng: it.lng, lat: it.lat, address: it.desc || "", rating: "", photo: it.photo || "" })) };
}

async function doSearch(city) {
  if (!city) { alert("先输入城市"); return; }
  curCity = city;
  $("#pickCard").style.display = "";
  $("#routeCard").style.display = "none";
  $("#loading").style.display = ""; $("#loading").textContent = "正在拉取…";
  $("#attrList").innerHTML = ""; $("#foodList").innerHTML = "";
  $("#tripName").value = city + "行程";

  let attr = [], food = [];
  if (amap) {
    [attr, food] = await Promise.all([
      searchPOI(city, "热门景点", "风景名胜", 18),
      searchPOI(city, "美食", "餐饮服务", 12),
    ]);
  }

  // 高德对未知/海外城市会无视 citylimit 返回全国热门 → 必须核对结果是否真在该城市
  const q = city.replace(/(市|区|县|省|自治州|特别行政区)$/, "");
  const onCity = attr.filter((p) => {
    const c = (p.city || "").replace(/(市|区|县|省|自治州|特别行政区)$/, "");
    return c && (c.includes(q) || q.includes(c));
  }).length;
  const isDomestic = attr.length > 0 && onCity >= Math.ceil(attr.length / 2);

  if (isDomestic) {                        // 国内：高德 + 图片评分
    foundAttr = attr; foundFood = food;
    $("#loading").style.display = "none";
    renderChecks("#attrList", attr, "景点");
    renderChecks("#foodList", food, "美食");
    return;
  }

  // 海外：OSM/Overpass + 维基图片
  $("#loading").textContent = "国内没搜到，按海外城市找经典景点（约 10 秒）…";
  const ov = await overseasSearch(city);
  foundAttr = ov.attr; foundFood = [];
  $("#loading").style.display = "none";
  renderChecks("#attrList", ov.attr, "景点");
  if (!ov.attr.length) $("#attrList").innerHTML = `<p class="empty">没找到。换个更准确的城市名（中/英文都行，如「京都」「Kyoto」「Paris」），或用上方「自己加地点」。</p>`;
  $("#foodList").innerHTML = `<p class="empty">海外美食暂未自动推荐 —— 到上方「自己加地点」粘店名/链接，可一起排进路线。</p>`;
}

function renderChecks(sel, list, kind) {
  const box = $(sel);
  box.innerHTML = "";
  list.forEach((p, i) => {
    const row = document.createElement("label");
    row.className = "chk" + (p.photo ? "" : " no-thumb");
    const img = p.photo
      ? `<img class="chk-thumb" src="${esc(p.photo)}" loading="lazy" alt="" onerror="this.classList.add('none');this.closest('.chk').classList.add('no-thumb')" />`
      : "";
    row.innerHTML = `<input type="checkbox" data-kind="${kind}" data-i="${i}" />
      ${img}
      <span class="chk-name">${esc(p.name)}</span>
      <small>${p.rating ? `<span class="rate">★${esc(p.rating)}</span> · ` : ""}${esc(p.address || "")}</small>`;
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
  const name = $("#tripName").value.trim() || (curCity + "行程");
  lastRoute = { city: curCity, name, days };
  $("#routeCard").style.display = "";
  drawMap(days);
  renderRouteList(days);
  $("#routeCard").scrollIntoView({ behavior: "smooth" });
}

// ---------- ③' 自己加地点 → 路线（国内外都行）----------
// 从地图链接里抠坐标：Google 用 WGS-84(需转 GCJ-02)，高德本身就是 GCJ-02。
function coordsFromUrl(url) {
  let m;
  if (m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)) return { lat: +m[1], lng: +m[2], wgs: true };
  if (m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)) return { lat: +m[1], lng: +m[2], wgs: true };
  if (m = url.match(/[?&](?:q|query|ll|daddr|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/)) return { lat: +m[1], lng: +m[2], wgs: true };
  if (m = url.match(/[?&](?:position|location)=(-?\d+\.\d+),(-?\d+\.\d+)/)) return { lng: +m[1], lat: +m[2], wgs: false };
  return null;
}
function nameFromUrl(url) {
  const m = url.match(/\/place\/([^/@]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
}
// 高德地理编码（国内强、海外弱）
function amapGeocode(addr) {
  return new Promise((res) => {
    if (!amap || !amap.Geocoder) return res(null);
    new amap.Geocoder({}).getLocation(addr, (status, result) => {
      const g = (status === "complete" && result.geocodes && result.geocodes[0]) || null;
      res(g ? { lng: g.location.lng, lat: g.location.lat, wgs: false } : null);
    });
  });
}
// OpenStreetMap Nominatim（免费全球，补海外）—— 返回 WGS-84
async function osmGeocode(q) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=zh,en&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (j && j[0]) return { lng: +j[0].lon, lat: +j[0].lat, wgs: true };
  } catch (e) { /* 网络/CORS 失败 → 当作没查到 */ }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 统一存 WGS-84：高德来的(gcj=true)转一下，其余(OSM/Google/原始经纬度)直接用
function pushPt(arr, name, lng, lat, gcj, address) {
  const [L, T] = gcj ? gcj2wgs(lng, lat) : [lng, lat];
  arr.push({ name, lng: L, lat: T, address: address || "" });
}

async function resolvePlaces(lines) {
  const pts = [], failed = [];
  let osmCalls = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https?:\/\//i.test(line)) {
      const c = coordsFromUrl(line);
      if (c) pushPt(pts, nameFromUrl(line) || "地点", c.lng, c.lat, !c.wgs, "");
      else failed.push(line + "（短链取不到坐标，改贴含数字的完整链接或直接写地名）");
      continue;
    }
    const mll = line.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (mll) { pushPt(pts, line, +mll[2], +mll[1], false, ""); continue; }
    // 全球地理编码优先（OSM 海外/国内都准）；高德只做兜底——它对海外会乱匹配到国内
    if (osmCalls++) await sleep(1100); // 遵守 Nominatim ≤1 req/s
    let g = await osmGeocode(line);
    if (g) pushPt(pts, line, g.lng, g.lat, false, "");
    else if (g = await amapGeocode(line)) pushPt(pts, line, g.lng, g.lat, true, "");
    else failed.push(line + "（没查到，换个更具体的写法）");
  }
  return { pts, failed };
}

async function generateFromText() {
  const lines = $("#placesInput").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) { alert("至少写 2 个地点，才能排路线"); return; }
  if (!amap) { alert("高德还没加载好，稍等或刷新"); return; }
  const btn = $("#genFromText"); const old = btn.textContent;
  btn.disabled = true; btn.textContent = "查坐标中…";
  $("#resolveMsg").style.display = "none";
  try {
    const { pts, failed } = await resolvePlaces(lines);
    if (pts.length < 2) { alert("能定位的地点不足 2 个：\n" + failed.join("\n")); return; }
    const picked = pts.map((p) => ({ ...p, type: "地点" }));
    const n = Math.max(1, Math.min(15, +$("#mDaysInput").value || 3));
    const days = splitDays(nearestOrder(picked), n);
    const name = $("#mTripName").value.trim() || "我的行程";
    lastRoute = { city: "", name, days };
    $("#routeCard").style.display = "";
    drawMap(days);
    renderRouteList(days);
    const m = $("#resolveMsg");
    if (failed.length) { m.style.display = ""; m.textContent = "这些没定位上，已跳过：" + failed.join("； "); }
    $("#routeCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) { alert("出错：" + e.message); }
  finally { btn.disabled = false; btn.textContent = old; }
}

function drawMap(days) {
  if (!window.L) return;
  if (!map) {
    map = L.map("mapBox", { zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);
  }
  if (mapLayer) mapLayer.remove();
  mapLayer = L.layerGroup().addTo(map);
  const latlngs = [];
  let idx = 0;
  const colors = ["#2f7d5b", "#e8553a", "#2d6cdf", "#b8860b", "#7d3cad"];
  days.forEach((day, di) => {
    day.forEach((p) => {
      idx++;
      const ll = [p.lat, p.lng];
      latlngs.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: "pin-wrap",
          html: `<div class="map-pin" style="background:${colors[di % colors.length]}">${idx}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        }),
      }).addTo(mapLayer).bindPopup(`第${di + 1}天 · ${esc(p.name)}`);
    });
  });
  if (latlngs.length > 1) L.polyline(latlngs, { color: "#2f7d5b", weight: 4, opacity: 0.7 }).addTo(mapLayer);
  map.invalidateSize();
  if (latlngs.length) map.fitBounds(latlngs, { padding: [34, 34], maxZoom: 15 });
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
  const name = lastRoute.name || $("#tripName").value.trim() || (lastRoute.city + "行程");
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
  sel.innerHTML = savedTrips.map((t) => `<option value="${t.id}">${esc(t.name)}${t.dest ? " · " + esc(t.dest) : ""}</option>`).join("");
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
