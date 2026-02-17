-- ==========================================
-- M2-A2 + A3: Moderation & Provider 审计字段
--
-- fee_entries:  补 moderation_status + 审计字段
-- providers:    补通用状态变更审计字段 + suspended 状态
-- ==========================================

-- ==========================================
-- 1. fee_entries: 补 moderation 字段
-- ==========================================

-- moderation_status 枚举（一次定死）：
--   unreviewed — 默认，新提交
--   approved   — admin 审核通过
--   flagged    — 系统自动或 admin 手动标记
--   rejected   — admin 驳回

ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed', 'approved', 'flagged', 'rejected'));

ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS moderation_note TEXT;

-- 索引：admin 审核队列的主要查询路径
CREATE INDEX IF NOT EXISTS idx_fee_entries_moderation_status
  ON fee_entries(moderation_status, created_at DESC)
  WHERE moderation_status IN ('unreviewed', 'flagged');

-- 回填现有数据（防御性写法：只处理已知值，不改其他）
UPDATE fee_entries SET moderation_status = 'approved'
  WHERE visibility IN ('public')  AND moderation_status = 'unreviewed';
UPDATE fee_entries SET moderation_status = 'flagged'
  WHERE visibility IN ('flagged') AND moderation_status = 'unreviewed';
UPDATE fee_entries SET moderation_status = 'rejected'
  WHERE visibility IN ('hidden')  AND moderation_status = 'unreviewed';
-- 未匹配的行保持 'unreviewed'（安全默认值）

-- ==========================================
-- 2. providers: 补通用状态变更审计字段
-- ==========================================

-- 添加 suspended 到 status 枚举
-- 先去掉旧 CHECK，再加新的
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_status_check;
ALTER TABLE providers ADD CONSTRAINT providers_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

-- 通用审计字段（不是只 approved_by，避免未来加 suspended/rejected 又要加一轮）
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- 回填现有 approved providers
UPDATE providers
SET status_changed_at = last_updated
WHERE status = 'approved' AND status_changed_at IS NULL;

-- 索引：admin 审核队列
CREATE INDEX IF NOT EXISTS idx_providers_pending
  ON providers(created_at DESC)
  WHERE status = 'pending';

-- ==========================================
-- 3. provider_actions 审计表（独立于 moderation_actions）
-- ==========================================
CREATE TABLE IF NOT EXISTS provider_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- 操作者
  actor_id UUID NOT NULL,   -- auth.uid() of admin
  actor_type VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (actor_type IN ('system', 'admin')),

  -- 动作
  action VARCHAR(50) NOT NULL
    CHECK (action IN ('approve', 'reject', 'suspend', 'unsuspend', 'update_info')),

  -- 状态快照
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_actions_provider ON provider_actions(provider_id, created_at DESC);
CREATE INDEX idx_provider_actions_actor ON provider_actions(actor_id, created_at DESC);

-- RLS
ALTER TABLE provider_actions ENABLE ROW LEVEL SECURITY;

-- 只有 admin/moderator 可读
CREATE POLICY "admins_read_provider_actions"
ON provider_actions FOR SELECT
USING (is_moderator_or_admin());

-- 不允许客户端直接写
-- （不创建 INSERT/UPDATE/DELETE 策略）

-- 表级权限（RLS 继续限制"只有 admin 能看到"）
GRANT SELECT ON provider_actions TO authenticated;

GRANT EXECUTE ON FUNCTION is_moderator_or_admin() TO authenticated;
