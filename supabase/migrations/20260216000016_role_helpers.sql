-- ==========================================
-- M2-A1: 角色判定 Helper Functions
--
-- 两层 API：
--   has_role(role)       — 内部取 auth.uid()，RPC 内最常用
--   has_role_uid(uid, role) — 给 service/admin 场景
--
-- 语义：只认 user_roles 表中当前存在的行。
--        未来若加 role 有效期/禁用，只需改这两个函数。
-- ==========================================

-- ==========================================
-- 1. has_role_uid(uid, role) — 基础版
-- ==========================================
CREATE OR REPLACE FUNCTION has_role_uid(
  p_uid UUID,
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_uid
      AND role = p_role
  );
$$;

-- ==========================================
-- 2. has_role(role) — 便捷版，内部取 auth.uid()
-- ==========================================
CREATE OR REPLACE FUNCTION has_role(
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT has_role_uid(auth.uid(), p_role);
$$;

-- ==========================================
-- 3. is_admin() — 最常用的快捷方式
-- ==========================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT has_role_uid(auth.uid(), 'admin');
$$;

-- ==========================================
-- 4. is_moderator_or_admin() — 审核权限
-- ==========================================
CREATE OR REPLACE FUNCTION is_moderator_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  );
$$;

-- ==========================================
-- 5. GRANT EXECUTE
-- ==========================================
GRANT EXECUTE ON FUNCTION has_role_uid(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_moderator_or_admin() TO authenticated;
