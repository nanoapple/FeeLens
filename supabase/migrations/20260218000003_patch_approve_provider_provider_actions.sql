-- supabase/migrations/20260218000003_patch_approve_provider_provider_actions.sql
-- ==========================================
-- Patch 3: approve_provider() 写 provider_actions + status_changed_*
--   - 权限：admin only
--   - action: approve/reject（保持原签名不变）
--   - providers: status_changed_at/by/reason + last_updated
--   - provider_actions: 结构化审计
--   - moderation_actions: 保留兼容流水（可后续移除）
-- ==========================================

CREATE OR REPLACE FUNCTION approve_provider(
  p_provider_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_old_status VARCHAR(20);
  v_new_status VARCHAR(20);
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  IF NOT is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized: admin role required');
  END IF;

  SELECT status
    INTO v_old_status
  FROM providers
  WHERE id = p_provider_id;

  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Provider not found');
  END IF;

  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject'  THEN 'rejected'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;

  -- 更新 provider 主表 + 审计字段
  UPDATE providers
  SET status = v_new_status,
      status_changed_at = NOW(),
      status_changed_by = v_admin_id,
      status_reason = p_reason,
      last_updated = NOW()
  WHERE id = p_provider_id;

  -- 结构化审计：provider_actions
  INSERT INTO provider_actions (
    provider_id,
    actor_id,
    actor_type,
    action,
    old_status,
    new_status,
    reason
  ) VALUES (
    p_provider_id,
    v_admin_id,
    'admin',
    p_action,
    v_old_status,
    v_new_status,
    COALESCE(p_reason, 'No reason provided')
  );

  -- 兼容旧审计桶：moderation_actions
  INSERT INTO moderation_actions (
    entry_id,
    actor_type,
    actor_id,
    action,
    reason,
    after_snapshot
  ) VALUES (
    NULL,
    'admin',
    v_admin_id::text,
    'provider_' || p_action,
    COALESCE(p_reason, 'No reason provided'),
    jsonb_build_object(
      'provider_id', p_provider_id,
      'old_status', v_old_status,
      'new_status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_status', v_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_provider(UUID, VARCHAR, TEXT) TO authenticated;