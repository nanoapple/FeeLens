-- ==========================================
-- Feelens MVP - Postgres RPC 函数（业务逻辑层）
-- ==========================================

-- ==========================================
-- 1. submit_fee_entry - 提交费用条目
-- ==========================================
CREATE OR REPLACE FUNCTION submit_fee_entry(
  p_provider_id UUID,
  p_property_type VARCHAR,
  p_management_fee_pct DECIMAL,
  p_management_fee_incl_gst BOOLEAN,
  p_letting_fee_weeks DECIMAL DEFAULT NULL,
  p_inspection_fee_fixed DECIMAL DEFAULT NULL,
  p_repair_margin_pct DECIMAL DEFAULT NULL,
  p_break_fee_amount DECIMAL DEFAULT NULL,
  p_hidden_items JSONB DEFAULT '[]',
  p_quote_transparency_score INT DEFAULT NULL,
  p_initial_quote_total DECIMAL DEFAULT NULL,
  p_final_total_paid DECIMAL DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_user_id UUID;
  v_pseudo_id VARCHAR(64);
  v_evidence_tier VARCHAR(1);
  v_risk_flags JSONB := '[]'::jsonb;
  v_visibility VARCHAR(20) := 'public';
  v_daily_count INT;
  v_provider_count INT;
  v_provider_status VARCHAR(20);
  v_provider_recent_count INT;
  v_provider_created_at TIMESTAMP;
BEGIN
  v_user_id := auth.uid();
  
  -- 1. 检查 provider 是否存在且已审核
  SELECT status, created_at INTO v_provider_status, v_provider_created_at
  FROM providers WHERE id = p_provider_id;
  
  IF v_provider_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Provider not found');
  END IF;
  
  IF v_provider_status != 'approved' THEN
    RETURN jsonb_build_object('error', 'Provider not yet approved');
  END IF;
  
  -- 2. Rate limiting：24h 内总提交数
  SELECT COUNT(*) INTO v_daily_count
  FROM fee_entries
  WHERE submitter_user_id = v_user_id
    AND created_at > NOW() - INTERVAL '24 hours';
  
  IF v_daily_count >= 3 THEN
    -- 记录拒绝审计
    INSERT INTO moderation_actions (entry_id, actor_type, actor_id, action, reason)
    VALUES (NULL, 'system', 'rate_limit', 'rejected_submission', 
            format('User %s exceeded daily limit', v_user_id));
    
    RETURN jsonb_build_object('error', '24小时内超过3条提交');
  END IF;
  
  -- 3. Rate limiting：针对同一 provider 1 年内提交数
  SELECT COUNT(*) INTO v_provider_count
  FROM fee_entries
  WHERE submitter_user_id = v_user_id
    AND provider_id = p_provider_id
    AND created_at > NOW() - INTERVAL '1 year';
  
  IF v_provider_count >= 5 THEN
    RETURN jsonb_build_object('error', '针对该商家1年内超过5条');
  END IF;
  
  -- 4. 风控检查
  IF v_provider_created_at > NOW() - INTERVAL '7 days' THEN
    v_risk_flags := v_risk_flags || '["new_provider"]'::jsonb;
  END IF;
  
  IF p_management_fee_pct < 4 OR p_management_fee_pct > 15 THEN
    v_risk_flags := v_risk_flags || '["extreme_value"]'::jsonb;
  END IF;
  
  SELECT COUNT(*) INTO v_provider_recent_count
  FROM fee_entries
  WHERE provider_id = p_provider_id
    AND created_at > NOW() - INTERVAL '48 hours';
  
  IF v_provider_recent_count >= 3 THEN
    v_risk_flags := v_risk_flags || '["high_frequency"]'::jsonb;
  END IF;
  
  -- 5. 确定 evidence tier
  IF p_initial_quote_total IS NOT NULL AND p_final_total_paid IS NOT NULL THEN
    v_evidence_tier := 'B';
  ELSE
    v_evidence_tier := 'C';
  END IF;
  
  -- 6. 确定 visibility
  IF jsonb_array_length(v_risk_flags) > 0 THEN
    v_visibility := 'flagged';
  END IF;
  
  -- 7. 生成 pseudo_id（匿名显示）
  v_pseudo_id := 'user_' || substring(v_user_id::text, 1, 8);
  
  -- 8. 插入 fee_entry（原子操作）
  INSERT INTO fee_entries (
    provider_id,
    submitter_user_id,
    submitter_pseudo_id,
    property_type,
    management_fee_pct,
    management_fee_incl_gst,
    letting_fee_weeks,
    inspection_fee_fixed,
    repair_margin_pct,
    break_fee_amount,
    hidden_items,
    quote_transparency_score,
    initial_quote_total,
    final_total_paid,
    evidence_tier,
    risk_flags,
    visibility
  ) VALUES (
    p_provider_id,
    v_user_id,
    v_pseudo_id,
    p_property_type,
    p_management_fee_pct,
    p_management_fee_incl_gst,
    p_letting_fee_weeks,
    p_inspection_fee_fixed,
    p_repair_margin_pct,
    p_break_fee_amount,
    p_hidden_items,
    p_quote_transparency_score,
    p_initial_quote_total,
    p_final_total_paid,
    v_evidence_tier,
    v_risk_flags,
    v_visibility
  )
  RETURNING id INTO v_entry_id;
  
  -- 9. 如果需要审核，写入审计日志
  IF v_visibility = 'flagged' THEN
    INSERT INTO moderation_actions (
      entry_id,
      actor_type,
      actor_id,
      action,
      reason,
      after_snapshot
    ) VALUES (
      v_entry_id,
      'system',
      'auto_flag',
      'flagged',
      'Auto-flagged: ' || v_risk_flags::text,
      jsonb_build_object('visibility', v_visibility, 'risk_flags', v_risk_flags)
    );
  END IF;
  
  -- 10. 更新 provider 统计
  UPDATE providers 
  SET review_count = review_count + 1,
      last_updated = NOW()
  WHERE id = p_provider_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'visibility', v_visibility,
    'requires_moderation', v_visibility = 'flagged'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 2. report_entry - 举报条目
-- ==========================================
CREATE OR REPLACE FUNCTION report_entry(
  p_user_id UUID,
  p_entry_id UUID,
  p_reason VARCHAR,
  p_details TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report_id UUID;
  v_report_count INT;
  v_entry_exists BOOLEAN;
BEGIN
  -- 1. 检查条目是否存在
  SELECT EXISTS(SELECT 1 FROM fee_entries WHERE id = p_entry_id) INTO v_entry_exists;
  
  IF NOT v_entry_exists THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;
  
  -- 2. 检查是否重复举报
  SELECT COUNT(*) INTO v_report_count
  FROM reports
  WHERE entry_id = p_entry_id
    AND reporter_user_id = p_user_id;
  
  IF v_report_count > 0 THEN
    RETURN jsonb_build_object('error', '您已举报过此条目');
  END IF;
  
  -- 3. 插入举报
  INSERT INTO reports (entry_id, reporter_user_id, reason, details)
  VALUES (p_entry_id, p_user_id, p_reason, p_details)
  RETURNING id INTO v_report_id;
  
  -- 4. 统计该条目的举报数
  SELECT COUNT(*) INTO v_report_count
  FROM reports
  WHERE entry_id = p_entry_id
    AND status = 'pending';
  
  -- 5. 如果举报数 >= 3，自动降权
  IF v_report_count >= 3 THEN
    UPDATE fee_entries
    SET visibility = 'flagged'
    WHERE id = p_entry_id;
    
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
-- 3. moderate_entry - 审核条目（管理员）
-- ==========================================
CREATE OR REPLACE FUNCTION moderate_entry(
  p_admin_id UUID,
  p_entry_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject' | 'hide'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_old_visibility VARCHAR(20);
  v_new_visibility VARCHAR(20);
  v_entry_snapshot JSONB;
BEGIN
  -- 1. 验证管理员权限
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = p_admin_id 
      AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
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
    p_admin_id::text,
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
-- 4. approve_provider - 审核商家（管理员）
-- ==========================================
CREATE OR REPLACE FUNCTION approve_provider(
  p_admin_id UUID,
  p_provider_id UUID,
  p_action VARCHAR,  -- 'approve' | 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_old_status VARCHAR(20);
  v_new_status VARCHAR(20);
BEGIN
  -- 1. 验证管理员权限
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = p_admin_id 
      AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
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
-- 5. resolve_dispute - 解决争议（管理员）
-- ==========================================
CREATE OR REPLACE FUNCTION resolve_dispute(
  p_admin_id UUID,
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
  v_is_admin BOOLEAN;
  v_entry_id UUID;
BEGIN
  -- 1. 验证管理员权限
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = p_admin_id 
      AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  
  -- 2. 获取 entry_id
  SELECT entry_id INTO v_entry_id
  FROM disputes
  WHERE id = p_dispute_id;
  
  IF v_entry_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;
  
  -- 3. 更新争议状态
  UPDATE disputes
  SET status = 'resolved',
      outcome = p_outcome,
      platform_response = p_platform_response,
      resolution_note = p_resolution_note,
      resolved_at = NOW()
  WHERE id = p_dispute_id;
  
  -- 4. 根据结果更新条目
  CASE p_outcome
    WHEN 'removed' THEN
      UPDATE fee_entries SET visibility = 'hidden' WHERE id = v_entry_id;
    WHEN 'corrected' THEN
      UPDATE fee_entries SET evidence_tier = 'C' WHERE id = v_entry_id;
    WHEN 'partial_hidden' THEN
      UPDATE fee_entries SET visibility = 'flagged' WHERE id = v_entry_id;
    ELSE NULL;  -- 'maintained' 不修改
  END CASE;
  
  -- 5. 记录审计
  INSERT INTO moderation_actions (
    entry_id,
    actor_type,
    actor_id,
    action,
    reason
  ) VALUES (
    v_entry_id,
    'admin',
    p_admin_id::text,
    'dispute_resolved',
    format('Outcome: %s. %s', p_outcome, p_resolution_note)
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
 
