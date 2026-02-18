-- supabase/migrations/20260218000002_patch_moderate_entry_sync_moderation_fields.sql
-- ==========================================
-- Patch 2: moderate_entry() 同步维护 moderation_status + moderated_*
--   - 权限：admin/moderator
--   - approve -> moderation_status=approved, visibility=public
--   - reject/hide -> moderation_status=rejected, visibility=hidden
--   - 审计：moderation_actions before/after
--   - 关联处理：approve 时将 entry_reports(open/triaged) -> resolved
--     （并兼容更新旧 reports：pending -> reviewed）
-- ==========================================

CREATE OR REPLACE FUNCTION moderate_entry(
  p_entry_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject' | 'hide'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_old_visibility VARCHAR(20);
  v_new_visibility VARCHAR(20);
  v_old_snapshot JSONB;
  v_new_snapshot JSONB;
  v_new_mod_status VARCHAR(20);
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  IF NOT is_moderator_or_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized: insufficient role');
  END IF;

  -- 当前状态 + 快照
  SELECT visibility, to_jsonb(fee_entries.*)
    INTO v_old_visibility, v_old_snapshot
  FROM fee_entries
  WHERE id = p_entry_id;

  IF v_old_visibility IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  -- 目标状态映射
  CASE p_action
    WHEN 'approve' THEN
      v_new_visibility := 'public';
      v_new_mod_status := 'approved';
    WHEN 'reject' THEN
      v_new_visibility := 'hidden';
      v_new_mod_status := 'rejected';
    WHEN 'hide' THEN
      v_new_visibility := 'hidden';
      v_new_mod_status := 'rejected';
    ELSE
      RETURN jsonb_build_object('error', 'Invalid action');
  END CASE;

  -- 更新 entry：同步治理字段
  UPDATE fee_entries
  SET visibility = v_new_visibility,
      moderation_status = v_new_mod_status,
      moderated_at = NOW(),
      moderated_by = v_admin_id,
      moderation_note = p_reason,
      updated_at = NOW()
  WHERE id = p_entry_id;

  v_new_snapshot := jsonb_build_object(
    'visibility', v_new_visibility,
    'moderation_status', v_new_mod_status,
    'moderated_at', NOW(),
    'moderated_by', v_admin_id,
    'moderation_note', p_reason
  );

  -- 审计
  INSERT INTO moderation_actions (
    entry_id,
    actor_type,
    actor_id,
    action,
    reason,
    before_snapshot,
    after_snapshot
  ) VALUES (
    p_entry_id,
    'admin',
    v_admin_id::text,
    p_action,
    p_reason,
    v_old_snapshot,
    v_new_snapshot
  );

  -- approve 时：关闭相关举报（新表）
  IF p_action = 'approve' THEN
    UPDATE entry_reports
    SET status = 'resolved',
        resolved_at = NOW(),
        resolved_by = v_admin_id,
        resolution_note = COALESCE(p_reason, 'Resolved by approval')
    WHERE entry_id = p_entry_id
      AND status IN ('open', 'triaged');

    -- 兼容旧表（若还在使用）
    UPDATE reports
    SET status = 'reviewed'
    WHERE entry_id = p_entry_id
      AND status = 'pending';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_visibility', v_new_visibility,
    'moderation_status', v_new_mod_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION moderate_entry(UUID, VARCHAR, TEXT) TO authenticated;