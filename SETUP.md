# 行囊 · 上线给家人 —— 分步清单

整个过程 ¥0。你只需要做 **第 1-3 步**（建后端 + 填两个值），第 4 步部署我可以帮你跑。

---

## 第 1 步：建 Supabase 项目（你做，约 3 分钟）

- **做什么**：浏览器打开 https://supabase.com → 注册/登录 → New project → 取个名（如 `travel-guide`）→ 设个数据库密码（随便记一下）→ 等它建好（约 1 分钟）。
- **验证**：进到项目主页，左侧能看到 Table Editor / SQL Editor。
- **兜底**：地区随便选离你近的；免费档（Free）就够。

## 第 2 步：建表（你做，约 1 分钟）

- **做什么**：左侧 **SQL Editor** → New query → 打开本目录 `schema.sql`，整段复制粘贴进去 → 点 **Run**。
- **验证**：左侧 Table Editor 里出现 `guides` 和 `trips` 两张表。
- **兜底**：若报 `publication ... already exists table`，无害，忽略即可。

## 第 3 步：填 config.js（你做，约 1 分钟）

- **做什么**：Supabase 左下 **Project Settings → API**，复制两个值：
  - **Project URL** → 填进 `config.js` 的 `SUPABASE_URL`
  - **Project API keys → `anon` `public`** → 填进 `SUPABASE_ANON_KEY`
- **验证**：本地起服务器看效果：
  ```bash
  cd travel-guide && python3 -m http.server 8777
  # 打开 http://localhost:8777/ ，顶部不再出现黄色"还没接后端"横幅，
  # 右上角显示"已同步"，攻略库里出现 4 个种子攻略
  ```
- **兜底**：填的是 `anon`/`public` key，**不是** `service_role`（那个是机密，别放前端）。anon key 公开是设计如此，权限由 `schema.sql` 控制。

## 第 4 步：部署成链接发给家人（我帮你跑 / 也可你自己）

- 走 GitHub Pages（公开仓库）。你确认后我用 `gh` 建仓库、推代码、开 Pages，给你一个 `https://...github.io/...` 链接。
- 把链接发到家庭群，**谁打开都是同一份共享攻略 + 行程，实时同步**。

---

## 它怎么运作（心里有数）

- **攻略库、行程** = 存 Supabase，全家共享、实时同步（谁加/改，别人几秒内看到）。
- **收藏（♥）** = 存各自浏览器，是你个人的，不共享。
- **没有登录**：拿到链接就能看和改（你选的"链接即进"）。链接别往公开渠道发即可。
- **不接 AI**：要加新目的地攻略，可以在 app 里点「+ 新建攻略」手填；或让我用 Claude 生成好，我直接写进库。

## 已知小事

- 两人同时改**同一个行程**，以后保存的覆盖先保存的（家用够用；要更强的协同再说）。
- `index.html` 用 CDN 引 supabase-js，没加 SRI 完整性校验（家用低风险）；要更稳可固定版本号 + 加 `integrity` 哈希。
