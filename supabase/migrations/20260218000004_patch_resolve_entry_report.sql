-- supabase/migrations/20260218000004_patch_resolve_entry_report.sql
-- ==========================================
-- Patch 4: resolve_entry_report()
--
-- 目的：让 admin 能"仅处理 report"而不强迫改变 entry。
--       降低治理误操作风险，使 report 队列真正像工单系统。
--
-- 合约：
--   p_action: 'resolve' | 'dismiss' | 'triage'
--   只更新 entry_reports.status + resolved_* 字段
--   不触碰 fee_entries 任何字段
--
-- 状态机：
--   open    → resolve (resolved)
--   open    → dismiss (dismissed)
--   open    → triage  (triaged)
--   triaged → resolve (resolved)
--   triaged → dismiss (dismissed)
--   resolved/dismissed → 任何 (拒绝，已终态)
--
-- 权限：admin 或 moderator
-- ==========================================

CREATE OR REPLACE FUNCTION resolve_entry_report(
  p_report_id UUID,
  p_action    VARCHAR,   -- 'resolve' | 'dismiss' | 'triage'
  p_note      TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id   UUID;
  v_old_status VARCHAR(20);
  v_new_status VARCHAR(20);
BEGIN
  -- 1. 身份
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 2. 权限（moderator 或 admin 均可）
  IF NOT is_moderator_or_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized: insufficient role');
  END IF;

  -- 3. 取当前状态
  SELECT status
    INTO v_old_status
  FROM entry_reports
  WHERE id = p_report_id;

  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Report not found');
  END IF;

  -- 4. 终态检查
  IF v_old_status IN ('resolved', 'dismissed') THEN
    RETURN jsonb_build_object(
      'error', format('Report is already in terminal state: %s', v_old_status)
    );
  END IF;

  -- 5. 状态映射
  v_new_status := CASE p_action
    WHEN 'resolve'  THEN 'resolved'
    WHEN 'dismiss'  THEN 'dismissed'
    WHEN 'triage'   THEN 'triaged'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RETURN jsonb_build_object(
      'error', format('Invalid action: %s (allowed: resolve, dismiss, triage)', p_action)
    );
  END IF;

  -- triage 只对 open 有意义
  IF p_action = 'triage' AND v_old_status != 'open' THEN
    RETURN jsonb_build_object(
      'error', format('Cannot triage report in status: %s', v_old_status)
    );
  END IF;

  -- 6. 更新 entry_reports（只动这一张表）
  UPDATE entry_reports
  SET
    status          = v_new_status,
    resolved_at     = CASE WHEN v_new_status IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END,
    resolved_by     = CASE WHEN v_new_status IN ('resolved', 'dismissed') THEN v_actor_id ELSE resolved_by END,
    resolution_note = COALESCE(p_note, resolution_note),
    updated_at      = NOW()
  WHERE id = p_report_id;

  RETURN jsonb_build_object(
    'success',     true,
    'old_status',  v_old_status,
    'new_status',  v_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_entry_report(UUID, VARCHAR, TEXT) TO authenticated;
