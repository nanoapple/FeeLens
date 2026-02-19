-- 1) 确保 user_roles 有 RLS（如果已有，重复执行无害）
alter table public.user_roles enable row level security;

-- 2) 删除所有可能造成递归的 policy（名字可能不同，用 if exists 容错）
drop policy if exists "user_roles_select_all_admin" on public.user_roles;
drop policy if exists "user_roles_read_all_admin" on public.user_roles;
drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
drop policy if exists "user_roles_select" on public.user_roles;
drop policy if exists "user_roles_read" on public.user_roles;

-- 3) 最小可用：authenticated 只能读自己的 role 行
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

-- 4) table-level grant（RLS 之外还需要 GRANT）
grant select on public.user_roles to authenticated;