-- 行囊 · 家庭共享攻略 —— Supabase 建表脚本
-- 用法：Supabase 控制台 → SQL Editor → 粘贴整段 → Run。
-- 访问模型：链接即进、无登录（anon 角色可读写）。旅游攻略无敏感信息，家用可接受。

-- 共享攻略库
create table if not exists guides (
  id         text primary key,
  dest       text,
  title      text,
  days       int,
  season     text,
  tags       jsonb default '[]'::jsonb,
  summary    text,
  pois       jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 共享行程（全家一起看/排）
create table if not exists trips (
  id         text primary key,
  name       text,
  dest       text,
  days       jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- 行级安全：开启，并给匿名角色放开读写（对应"链接即进无登录"）
alter table guides enable row level security;
alter table trips  enable row level security;

drop policy if exists "anon all guides" on guides;
drop policy if exists "anon all trips"  on trips;
create policy "anon all guides" on guides for all to anon using (true) with check (true);
create policy "anon all trips"  on trips  for all to anon using (true) with check (true);

-- 开启实时同步（家人改了彼此能立刻看到）
alter publication supabase_realtime add table guides;
alter publication supabase_realtime add table trips;
