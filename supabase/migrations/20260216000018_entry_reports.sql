-- ==========================================
-- M2-A4: entry_reports 表（替代旧 reports）
--
-- 决策：新建 entry_reports，旧 reports 数据迁移后冻结。
-- 理由：旧 reports 字段不足（无 evidence 关联、无处理审计）
--       且 reason 枚举不匹配业务需求。
-- ==========================================

-- ==========================================
-- 1. entry_reports 表
-- ==========================================
CREATE TABLE IF NOT EXISTS entry_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 被举报的条目
  entry_id UUID NOT NULL REFERENCES fee_entries(id) ON DELETE CASCADE,

  -- 举报人（auth.uid()）
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 举报原因
  reason_code VARCHAR(50) NOT NULL
    CHECK (reason_code IN (
      'price_incorrect',
      'service_not_delivered',
      'duplicate',
      'fraud',
      'expired',
      'offensive',
      'other'
    )),
  report_text TEXT,

  -- 证据引用（可选）
  evidence_upload_id UUID REFERENCES evidence_uploads(id) ON DELETE SET NULL,

  -- 状态机：open → triaged → resolved | dismissed
  -- （顾问说 M2 不引入 triaged，但预留枚举，A 定死不改）
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed')),

  -- 处理审计
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_entry_reports_entry ON entry_reports(entry_id, created_at DESC);
CREATE INDEX idx_entry_reports_reporter ON entry_reports(reporter_user_id, created_at DESC);
CREATE INDEX idx_entry_reports_status ON entry_reports(status, created_at DESC)
  WHERE status IN ('open', 'triaged');
-- 唯一约束：同一用户对同一 entry 只能有一个 open 状态的 report
CREATE UNIQUE INDEX uniq_open_report_per_user_entry
  ON entry_reports(reporter_user_id, entry_id)
  WHERE status = 'open';

-- ==========================================
-- 2. RLS
-- ==========================================
ALTER TABLE entry_reports ENABLE ROW LEVEL SECURITY;

-- 举报人可读自己的 report
CREATE POLICY "users_read_own_reports"
ON entry_reports FOR SELECT
USING (reporter_user_id = auth.uid());

-- admin/moderator 可读全部
CREATE POLICY "admins_read_all_reports"
ON entry_reports FOR SELECT
USING (is_moderator_or_admin());

-- 不允许客户端直接写（只走 RPC）

-- 表级权限（RLS 继续限制"只有举报人/admin 能看到"）
GRANT SELECT ON entry_reports TO authenticated;

-- ==========================================
-- 3. 迁移旧 reports 数据到 entry_reports
-- ==========================================
INSERT INTO entry_reports (
  id,
  entry_id,
  reporter_user_id,
  reason_code,
  report_text,
  status,
  created_at,
  updated_at
)
SELECT
  r.id,
  r.entry_id,
  r.reporter_user_id,
  -- 旧 reason 映射到新 reason_code
  CASE r.reason
    WHEN 'inaccurate' THEN 'price_incorrect'
    WHEN 'fake'       THEN 'fraud'
    WHEN 'expired'    THEN 'expired'
    WHEN 'offensive'  THEN 'offensive'
    ELSE 'other'
  END,
  r.details,
  -- 旧 status 映射到新 status
  CASE r.status
    WHEN 'pending'   THEN 'open'
    WHEN 'reviewed'  THEN 'resolved'
    WHEN 'dismissed' THEN 'dismissed'
    ELSE 'open'
  END,
  r.created_at,
  r.created_at  -- 旧表没有 updated_at
FROM reports r
WHERE r.reporter_user_id IS NOT NULL  -- 排除匿名（ON DELETE SET NULL 的）
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 4. 冻结旧 reports 表
--    不 DROP（保留兼容），但标记为废弃
-- ==========================================

-- 在旧表上加注释标记废弃
COMMENT ON TABLE reports IS 'DEPRECATED: 已被 entry_reports 替代。仅保留历史兼容，不再写入新数据。';

-- 移除旧 reports 上的写入策略（如果有的话），确保不被写入
-- （当前 reports 本就没有 INSERT 策略，RLS 已经阻止客户端写入）

-- ==========================================
-- 5. updated_at 触发器
-- ==========================================
CREATE TRIGGER trigger_entry_reports_updated_at
BEFORE UPDATE ON entry_reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
