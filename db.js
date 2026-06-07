// ===== 数据层：Supabase（共享 + 实时同步） =====
// 攻略库 guides、行程 trips 都存在后端，全家共享。
// 收藏 favorites 仍存本地（每台设备各自的个人收藏，不共享）。
const DB = (() => {
  let sb = null;
  let configured = false;

  function init() {
    const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("YOUR_") || key.includes("YOUR_")) {
      configured = false;
      return false;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.error("supabase-js 没加载到");
      configured = false;
      return false;
    }
    sb = window.supabase.createClient(url, key);
    configured = true;
    return true;
  }
  const isConfigured = () => configured;

  // ---- guides ----
  async function listGuides() {
    const { data, error } = await sb.from("guides").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function upsertGuide(g) {
    const { error } = await sb.from("guides").upsert(g);
    if (error) throw error;
  }
  async function deleteGuide(id) {
    const { error } = await sb.from("guides").delete().eq("id", id);
    if (error) throw error;
  }
  // 首次为空时用种子数据填充共享库
  async function seedGuidesIfEmpty(seed) {
    const existing = await listGuides();
    if (existing.length === 0 && Array.isArray(seed) && seed.length) {
      const { error } = await sb.from("guides").upsert(seed);
      if (error) throw error;
      return true;
    }
    return false;
  }

  // ---- trips ----
  async function listTrips() {
    const { data, error } = await sb.from("trips").select("*").order("updated_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function upsertTrip(t) {
    const row = { id: t.id, name: t.name, dest: t.dest, days: t.days, updated_at: new Date().toISOString() };
    const { error } = await sb.from("trips").upsert(row);
    if (error) throw error;
  }
  async function deleteTrip(id) {
    const { error } = await sb.from("trips").delete().eq("id", id);
    if (error) throw error;
  }

  // ---- 实时：任一表变化就回调 ----
  function onChange(cb) {
    sb.channel("tg-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "guides" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, cb)
      .subscribe();
  }

  return {
    init, isConfigured,
    listGuides, upsertGuide, deleteGuide, seedGuidesIfEmpty,
    listTrips, upsertTrip, deleteTrip,
    onChange,
  };
})();
