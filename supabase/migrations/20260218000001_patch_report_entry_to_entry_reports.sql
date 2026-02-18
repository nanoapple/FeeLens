-- supabase/migrations/20260218000001_patch_report_entry_to_entry_reports.sql
-- ==========================================
-- Patch 1: report_entry() 写入 entry_reports（替代旧 reports）
--   - 身份来源：auth.uid()
--   - 防重复：同一用户同一 entry 只能有一个 open report（同时也做显式校验）
--   - 计数触发：open reports >= 3 自动将 entry 降权 flagged
--   - 同步：若存在 moderation_status 字段，则一并置为 'flagged'
-- ==========================================

CREATE OR REPLACE FUNCTION report_entry(
  p_entry_id UUID,
  p_reason VARCHAR,
  p_details TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_report_id UUID;
  v_open_count INT;
  v_entry_exists BOOLEAN;
  v_submitter UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1) entry 必须存在
  SELECT EXISTS(SELECT 1 FROM fee_entries WHERE id = p_entry_id)
    INTO v_entry_exists;

  IF NOT v_entry_exists THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  -- 2) 不允许举报自己的 entry（submitter_user_id 为空则跳过）
  SELECT submitter_user_id
    INTO v_submitter
  FROM fee_entries
  WHERE id = p_entry_id;

  IF v_submitter IS NOT NULL AND v_submitter = v_user_id THEN
    RETURN jsonb_build_object('error', 'Cannot report your own entry');
  END IF;

  -- 3) 显式防重复（不依赖 partial unique index 的 ON CONFLICT）
  IF EXISTS (
    SELECT 1
    FROM entry_reports
    WHERE entry_id = p_entry_id
      AND reporter_user_id = v_user_id
      AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('error', 'You already have an open report for this entry');
  END IF;

  -- 4) 插入 entry_reports（reason_code 在表级 CHECK 中校验）
  INSERT INTO entry_reports (entry_id, reporter_user_id, reason_code, report_text)
  VALUES (p_entry_id, v_user_id, p_reason, p_details)
  RETURNING id INTO v_report_id;

  -- 5) 统计 open 报告数
  SELECT COUNT(*)
    INTO v_open_count
  FROM entry_reports
  WHERE entry_id = p_entry_id
    AND status = 'open';

  -- 6) >= 3 自动降权：public -> flagged（只对 public 执行）
  IF v_open_count >= 3 THEN
    -- 同时尽量同步 moderation_status（若列存在）
    UPDATE fee_entries
    SET visibility = 'flagged',
        moderation_status = CASE
          WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='fee_entries'
              AND column_name='moderation_status'
          ) THEN 'flagged'
          ELSE moderation_status
        END,
        updated_at = NOW()
    WHERE id = p_entry_id
      AND visibility = 'public';

    INSERT INTO moderation_actions (
      entry_id,
      actor_type,
      actor_id,
      action,
      reason
    ) VALUES (
      p_entry_id,
      'system',
      'auto_flag',
      'flagged',
      format('%s open reports received', v_open_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'open_report_count', v_open_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION report_entry(UUID, VARCHAR, TEXT) TO authenticated;