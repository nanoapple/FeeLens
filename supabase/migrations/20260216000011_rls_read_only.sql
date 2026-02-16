 -- ==========================================
-- Feelens MVP - RLS 策略（只读防火墙）
-- ==========================================

-- ==========================================
-- providers 表
-- ==========================================

-- 1. 所有人可读已审核的 providers
CREATE POLICY "public_read_approved_providers"
ON providers FOR SELECT
USING (status = 'approved');

-- 2. 管理员可读所有 providers
CREATE POLICY "admins_read_all_providers"
ON providers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
  )
);

-- 3. 禁止直接写入（必须通过 RPC）
-- 不创建 INSERT/UPDATE/DELETE 策略 = 默认拒绝

-- ==========================================
-- fee_entries 表
-- ==========================================

-- 1. 所有人可读 public 状态的 entries
CREATE POLICY "public_read_public_entries"
ON fee_entries FOR SELECT
USING (visibility = 'public');

-- 2. 管理员可读 flagged 状态
CREATE POLICY "moderators_read_flagged_entries"
ON fee_entries FOR SELECT
USING (
  visibility = 'flagged'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
  )
);

-- 3. 用户可读自己的 entries（包括 flagged/hidden）
CREATE POLICY "users_read_own_entries"
ON fee_entries FOR SELECT
USING (submitter_user_id = auth.uid());

-- 4. 禁止直接写入
-- 不创建 INSERT/UPDATE/DELETE 策略

-- ==========================================
-- fee_hidden_tags 表
-- ==========================================

-- 跟随 fee_entries 的可见性
CREATE POLICY "read_tags_for_visible_entries"
ON fee_hidden_tags FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM fee_entries
    WHERE fee_entries.id = fee_hidden_tags.entry_id
      AND (
        fee_entries.visibility = 'public'
        OR fee_entries.submitter_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
      )
  )
);

-- ==========================================
-- moderation_actions 表
-- ==========================================

-- 只有管理员可读
CREATE POLICY "admins_read_moderation"
ON moderation_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
  )
);

-- ==========================================
-- disputes 表
-- ==========================================

-- 管理员可读所有争议
CREATE POLICY "admins_read_disputes"
ON disputes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
  )
);

-- 用户可读与自己提交相关的争议
CREATE POLICY "users_read_own_disputes"
ON disputes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM fee_entries
    WHERE fee_entries.id = disputes.entry_id
      AND fee_entries.submitter_user_id = auth.uid()
  )
);

-- ==========================================
-- user_roles 表
-- ==========================================

-- 用户可读自己的角色
CREATE POLICY "users_read_own_roles"
ON user_roles FOR SELECT
USING (user_id = auth.uid());

-- 管理员可读所有角色
CREATE POLICY "admins_read_all_roles"
ON user_roles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles AS ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'admin'
  )
);

-- ==========================================
-- reports 表
-- ==========================================

-- 管理员可读所有举报
CREATE POLICY "admins_read_reports"
ON reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
  )
);

-- 用户可读自己的举报
CREATE POLICY "users_read_own_reports"
ON reports FOR SELECT
USING (reporter_user_id = auth.uid());

