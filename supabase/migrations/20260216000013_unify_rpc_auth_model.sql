-- ==========================================
-- Feelens MVP - RPC 安全模型统一
-- 所有 RPC 移除外部传入的 user_id/admin_id，
-- 一律使用 auth.uid() 作为唯一身份来源。
-- ==========================================

-- ==========================================
-- 1. report_entry - 举报条目
-- 变更：移除 p_user_id 参数，内部用 auth.uid()
-- ==========================================
CREATE OR REPLACE FUNCTION report_entry(
  p_entry_id UUID,
  p_reason VARCHAR,
  p_details TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_report_id UUID;
  v_report_count INT;
  v_entry_exists BOOLEAN;
BEGIN
  -- 从 JWT 获取用户身份（唯一信任来源）
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1. 检查条目是否存在
  SELECT EXISTS(SELECT 1 FROM fee_entries WHERE id = p_entry_id) INTO v_entry_exists;
  
  IF NOT v_entry_exists THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;
  
  -- 2. 不允许举报自己的条目
  IF EXISTS (
    SELECT 1 FROM fee_entries 
    WHERE id = p_entry_id AND submitter_user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Cannot report your own entry');
  END IF;
  
  -- 3. 检查是否重复举报
  SELECT COUNT(*) INTO v_report_count
  FROM reports
  WHERE entry_id = p_entry_id
    AND reporter_user_id = v_user_id;
  
  IF v_report_count > 0 THEN
    RETURN jsonb_build_object('error', '您已举报过此条目');
  END IF;
  
  -- 4. 插入举报
  INSERT INTO reports (entry_id, reporter_user_id, reason, details)
  VALUES (p_entry_id, v_user_id, p_reason, p_details)
  RETURNING id INTO v_report_id;
  
  -- 5. 统计该条目的举报数
  SELECT COUNT(*) INTO v_report_count
  FROM reports
  WHERE entry_id = p_entry_id
    AND status = 'pending';
  
  -- 6. 如果举报数 >= 3，自动降权
  IF v_report_count >= 3 THEN
    UPDATE fee_entries
    SET visibility = 'flagged'
    WHERE id = p_entry_id
      AND visibility = 'public';  -- 只降权 public 状态的
    
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
      format('%s reports received', v_report_count)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 2. moderate_entry - 审核条目（管理员）
-- 变更：移除 p_admin_id 参数，内部用 auth.uid()
-- ==========================================
CREATE OR REPLACE FUNCTION moderate_entry(
  p_entry_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject' | 'hide'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_old_visibility VARCHAR(20);
  v_new_visibility VARCHAR(20);
  v_entry_snapshot JSONB;
BEGIN
  -- 从 JWT 获取管理员身份（唯一信任来源）
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1. 验证管理员权限
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = v_admin_id 
      AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized: insufficient role');
  END IF;
  
  -- 2. 获取当前状态
  SELECT visibility, to_jsonb(fee_entries.*) 
  INTO v_old_visibility, v_entry_snapshot
  FROM fee_entries
  WHERE id = p_entry_id;
  
  IF v_old_visibility IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;
  
  -- 3. 确定新状态
  CASE p_action
    WHEN 'approve' THEN v_new_visibility := 'public';
    WHEN 'reject' THEN v_new_visibility := 'hidden';
    WHEN 'hide' THEN v_new_visibility := 'hidden';
    ELSE RETURN jsonb_build_object('error', 'Invalid action');
  END CASE;
  
  -- 4. 更新条目
  UPDATE fee_entries
  SET visibility = v_new_visibility,
      updated_at = NOW()
  WHERE id = p_entry_id;
  
  -- 5. 记录审计
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
    v_entry_snapshot,
    jsonb_build_object('visibility', v_new_visibility)
  );
  
  -- 6. 如果批准，更新所有相关举报为已审核
  IF p_action = 'approve' THEN
    UPDATE reports
    SET status = 'reviewed'
    WHERE entry_id = p_entry_id
      AND status = 'pending';
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_visibility', v_new_visibility
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 3. approve_provider - 审核商家（管理员）
-- 变更：移除 p_admin_id 参数，内部用 auth.uid()
-- ==========================================
CREATE OR REPLACE FUNCTION approve_provider(
  p_provider_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_old_status VARCHAR(20);
  v_new_status VARCHAR(20);
BEGIN
  -- 从 JWT 获取管理员身份（唯一信任来源）
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1. 验证管理员权限（approve_provider 仅限 admin，不含 moderator）
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = v_admin_id 
      AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized: admin role required');
  END IF;
  
  -- 2. 获取当前状态
  SELECT status INTO v_old_status
  FROM providers
  WHERE id = p_provider_id;
  
  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Provider not found');
  END IF;
  
  -- 3. 确定新状态
  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE NULL
  END;
  
  IF v_new_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;
  
  -- 4. 更新 provider
  UPDATE providers
  SET status = v_new_status,
      last_updated = NOW()
  WHERE id = p_provider_id;
  
  -- 5. 记录审计
  INSERT INTO moderation_actions (
    entry_id,
    actor_type,
    actor_id,
    action,
    reason,
    after_snapshot
  ) VALUES (
    NULL,  -- provider 审核不关联 entry
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

-- ==========================================
-- 4. resolve_dispute - 解决争议（管理员）
-- 变更：移除 p_admin_id 参数，内部用 auth.uid()
-- ==========================================
CREATE OR REPLACE FUNCTION resolve_dispute(
  p_dispute_id UUID,
  p_outcome VARCHAR,
  p_platform_response TEXT,
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_entry_id UUID;
  v_dispute_status VARCHAR(20);
BEGIN
  -- 从 JWT 获取管理员身份（唯一信任来源）
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1. 验证管理员权限
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = v_admin_id 
      AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized: insufficient role');
  END IF;
  
  -- 2. 获取 dispute 信息
  SELECT entry_id, status INTO v_entry_id, v_dispute_status
  FROM disputes
  WHERE id = p_dispute_id;
  
  IF v_entry_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;
  
  -- 3. 只能处理 pending 状态的争议
  IF v_dispute_status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Dispute already resolved');
  END IF;
  
  -- 4. 校验 outcome 值
  IF p_outcome NOT IN ('maintained', 'corrected', 'removed', 'partial_hidden') THEN
    RETURN jsonb_build_object('error', 'Invalid outcome value');
  END IF;
  
  -- 5. 更新争议状态
  UPDATE disputes
  SET status = 'resolved',
      outcome = p_outcome,
      platform_response = p_platform_response,
      resolution_note = p_resolution_note,
      resolved_at = NOW()
  WHERE id = p_dispute_id;
  
  -- 6. 根据结果更新条目
  CASE p_outcome
    WHEN 'removed' THEN
      UPDATE fee_entries SET visibility = 'hidden' WHERE id = v_entry_id;
    WHEN 'corrected' THEN
      UPDATE fee_entries SET evidence_tier = 'C' WHERE id = v_entry_id;
    WHEN 'partial_hidden' THEN
      UPDATE fee_entries SET visibility = 'flagged' WHERE id = v_entry_id;
    ELSE NULL;  -- 'maintained' 不修改
  END CASE;
  
  -- 7. 更新关联 entry 的 dispute_status
  UPDATE fee_entries 
  SET dispute_status = 'resolved'
  WHERE id = v_entry_id;
  
  -- 8. 记录审计
  INSERT INTO moderation_actions (
    entry_id,
    actor_type,
    actor_id,
    action,
    reason
  ) VALUES (
    v_entry_id,
    'admin',
    v_admin_id::text,
    'dispute_resolved',
    format('Outcome: %s. %s', p_outcome, COALESCE(p_resolution_note, ''))
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'outcome', p_outcome
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
