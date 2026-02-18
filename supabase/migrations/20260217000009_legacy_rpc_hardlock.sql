-- ==========================================
-- Phase 4-C1: Legacy submit_fee_entry 硬防线
--
-- 在 legacy RPC 内部强制写入 industry_key='real_estate'。
-- 如果未来有人改签名加 industry_key 参数，也会被拦截。
--
-- 同时加入 fee_breakdown/context 双写（Phase 2 backfill 策略）：
-- 房地产旧列数据同步写入 JSONB，为读路径统一做准备。
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
SET search_path = public, auth
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
  -- 双写用
  v_fee_breakdown JSONB;
  v_context JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- 1. provider gate
  SELECT status, created_at INTO v_provider_status, v_provider_created_at
  FROM providers WHERE id = p_provider_id;

  IF v_provider_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Provider not found');
  END IF;

  IF v_provider_status != 'approved' THEN
    RETURN jsonb_build_object('error', 'Provider not yet approved');
  END IF;

  -- 2. rate limit: 24h
  SELECT COUNT(*) INTO v_daily_count
  FROM fee_entries
  WHERE submitter_user_id = v_user_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF v_daily_count >= 3 THEN
    INSERT INTO moderation_actions (entry_id, actor_type, actor_id, action, reason)
    VALUES (NULL, 'system', 'rate_limit', 'rejected_submission',
            format('User %s exceeded daily limit', v_user_id));
    RETURN jsonb_build_object('error', '24小时内超过3条提交');
  END IF;

  -- 3. rate limit: per provider per year
  SELECT COUNT(*) INTO v_provider_count
  FROM fee_entries
  WHERE submitter_user_id = v_user_id
    AND provider_id = p_provider_id
    AND created_at > NOW() - INTERVAL '1 year';

  IF v_provider_count >= 5 THEN
    RETURN jsonb_build_object('error', '针对该商家1年内超过5条');
  END IF;

  -- 4. risk flags
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

  -- 5. evidence tier
  IF p_initial_quote_total IS NOT NULL AND p_final_total_paid IS NOT NULL THEN
    v_evidence_tier := 'B';
  ELSE
    v_evidence_tier := 'C';
  END IF;

  -- 6. visibility
  IF jsonb_array_length(v_risk_flags) > 0 THEN
    v_visibility := 'flagged';
  END IF;

  -- 7. pseudo_id
  v_pseudo_id := 'user_' || substring(v_user_id::text, 1, 8);

  -- 8. 构造双写 JSONB（strip_nulls 避免写入大量 null key）
  v_fee_breakdown := jsonb_strip_nulls(jsonb_build_object(
    'management_fee_pct', p_management_fee_pct,
    'management_fee_incl_gst', p_management_fee_incl_gst,
    'letting_fee_weeks', p_letting_fee_weeks,
    'inspection_fee_fixed', p_inspection_fee_fixed,
    'repair_margin_pct', p_repair_margin_pct,
    'break_fee_amount', p_break_fee_amount
  ));

  v_context := jsonb_strip_nulls(jsonb_build_object(
    'property_type', p_property_type
  ));

  -- 9. INSERT（含双写 + 强制 industry_key='real_estate'）
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
    visibility,
    -- 强制锁定 + 双写
    industry_key,
    service_key,
    fee_breakdown,
    context
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
    v_visibility,
    -- 硬锁定：永远是 real_estate
    'real_estate',
    'property_management',
    v_fee_breakdown,
    v_context
  )
  RETURNING id INTO v_entry_id;

  -- 10. flagged 审计
  IF v_visibility = 'flagged' THEN
    INSERT INTO moderation_actions (
      entry_id, actor_type, actor_id, action, reason, after_snapshot
    ) VALUES (
      v_entry_id, 'system', 'auto_flag', 'flagged',
      'Auto-flagged: ' || v_risk_flags::text,
      jsonb_build_object('visibility', v_visibility, 'risk_flags', v_risk_flags)
    );
  END IF;

  -- 11. provider stats
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
