// ===== 唯一需要你填的文件 =====
// 在 Supabase 建好项目后，把两个值粘进来（见 SETUP.md）。
// 路径：Supabase 控制台 → Project Settings → API
//   - Project URL        → SUPABASE_URL
//   - Project API keys → anon / public → SUPABASE_ANON_KEY
// anon key 设计上就是给前端公开用的，配合 schema.sql 的权限即可，别填 service_role key。

window.SUPABASE_URL = "https://zykuztrzcptuudjrnvjz.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_MQxfuP5_-DEVEZqkIszpxA_aHvyKx1o";

// 高德地图 Web端(JS API) —— 用于拉真实景点/美食 + 算路线。前端 key，靠域名白名单(github.io)限制。
window.AMAP_KEY = "29db5d3865db02c90fe86ccd634a26ab";
window.AMAP_JSCODE = "bd6ad83497fd84961850fc8cae318030";
