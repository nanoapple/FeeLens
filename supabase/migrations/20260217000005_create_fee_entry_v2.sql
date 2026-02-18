-- ==========================================
-- Phase 3.2: create_fee_entry_v2 — 通用多行业写入 RPC
--
-- 定位：
--   - legal_services 及所有新行业只走 v2
--   - legacy submit_fee_entry 冻结为 real_estate 专用
--   - 过渡期双入口并行
--
-- DB 层硬边界校验（不可绕过）：
--   1. auth.uid() 身份识别
--   2. provider 存在且 approved
--   3. 平台级 rate limit（24h 3条/用户, 同 provider 年5条）
--   4. industry_key 存在且 active
--   5. fee_breakdown key 白名单（从 schema.properties 推导）
--   6. pricing_model → 必填字段（MVP 硬规则）
--   7. 风控标记（new_provider, high_frequency）
--   8. evidence_tier + visibility + moderation_status 计算
--   9. 审计写入（flagged 时）
--   10. provider 统计更新
--
-- Edge Function 负责更完整的 JSON Schema 校验 + UX 体验。
-- ==========================================

CREATE OR REPLACE FUNCTION public.create_fee_entry_v2(
  p_provider_id UUID,
  p_industry_key TEXT,
  p_service_key TEXT DEFAULT NULL,
  p_fee_breakdown JSONB DEFAULT '{}'::jsonb,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_hidden_items JSONB DEFAULT '[]'::jsonb,
  p_quote_transparency_score INTEGER DEFAULT NULL,
  p_initial_quote_total NUMERIC DEFAULT NULL,
  p_final_total_paid NUMERIC DEFAULT NULL,
  p_evidence_object_key TEXT DEFAULT NULL
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
  v_moderation_status VARCHAR(20) := 'unreviewed';

  -- provider checks
  v_provider_status VARCHAR(20);
  v_provider_created_at TIMESTAMP;

  -- rate limiting
  v_daily_count INT;
  v_provider_year_count INT;
  v_provider_recent_count INT;

  -- schema validation
  v_schema_active BOOLEAN;
  v_fee_schema JSONB;
  v_allowed_fee_keys TEXT[];
  v_disallowed_keys TEXT[];
  v_pricing_model TEXT;
BEGIN
  -- ==========================================
  -- 0. 身份验证（不信任外部传参）
  -- ==========================================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- ==========================================
  -- 1. industry schema 校验（必须存在且 active）
  -- ==========================================
  SELECT is_active, fee_breakdown_schema
    INTO v_schema_active, v_fee_schema
  FROM public.industry_schemas
  WHERE industry_key = p_industry_key;

  IF v_schema_active IS NULL THEN
    RETURN jsonb_build_object('error', 'Industry schema not found',
                              'details', p_industry_key);
  END IF;

  IF v_schema_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('error', 'Industry schema is inactive');
  END IF;

  -- ==========================================
  -- 2. provider 校验（存在且 approved）
  -- ==========================================
  SELECT status, created_at
    INTO v_provider_status, v_provider_created_at
  FROM public.providers
  WHERE id = p_provider_id;

  IF v_provider_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Provider not found');
  END IF;

  IF v_provider_status != 'approved' THEN
    RETURN jsonb_build_object('error', 'Provider not yet approved');
  END IF;

  -- ==========================================
  -- 3. 平台级 rate limit: 24h 同用户总提交 < 3
  -- ==========================================
  SELECT COUNT(*) INTO v_daily_count
  FROM public.fee_entries
  WHERE submitter_user_id = v_user_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF v_daily_count >= 3 THEN
    INSERT INTO public.moderation_actions
      (entry_id, actor_type, actor_id, action, reason)
    VALUES
      (NULL, 'system', 'rate_limit', 'rejected_submission',
       format('User %s exceeded daily limit (%s/3)', v_user_id, v_daily_count));
    RETURN jsonb_build_object('error', '24小时内超过3条提交');
  END IF;

  -- ==========================================
  -- 4. 平台级 rate limit: 同 provider 1年内 < 5
  -- ==========================================
  SELECT COUNT(*) INTO v_provider_year_count
  FROM public.fee_entries
  WHERE submitter_user_id = v_user_id
    AND provider_id = p_provider_id
    AND created_at > NOW() - INTERVAL '1 year';

  IF v_provider_year_count >= 5 THEN
    RETURN jsonb_build_object('error', '针对该商家1年内超过5条');
  END IF;

  -- ==========================================
  -- 5. 风控标记
  -- ==========================================

  -- 5a. 新 provider（7天内创建）
  IF v_provider_created_at > NOW() - INTERVAL '7 days' THEN
    v_risk_flags := v_risk_flags || '["new_provider"]'::jsonb;
  END IF;

  -- 5b. 同 provider 48h 高频
  SELECT COUNT(*) INTO v_provider_recent_count
  FROM public.fee_entries
  WHERE provider_id = p_provider_id
    AND created_at > NOW() - INTERVAL '48 hours';

  IF v_provider_recent_count >= 3 THEN
    v_risk_flags := v_risk_flags || '["high_frequency"]'::jsonb;
  END IF;

  -- ==========================================
  -- 6. fee_breakdown key 白名单校验
  --    从 fee_breakdown_schema.properties 推导允许的 keys
  --    不允许的 key → 直接拒绝（防 JSONB 垃圾桶）
  -- ==========================================
  SELECT array_agg(key)
    INTO v_allowed_fee_keys
  FROM jsonb_object_keys(
    COALESCE(v_fee_schema -> 'properties', '{}'::jsonb)
  ) AS key;

  -- 如果 schema 没有 properties（如 real_estate MVP 阶段），跳过白名单
  IF v_allowed_fee_keys IS NOT NULL AND array_length(v_allowed_fee_keys, 1) > 0 THEN
    SELECT array_agg(k)
      INTO v_disallowed_keys
    FROM jsonb_object_keys(COALESCE(p_fee_breakdown, '{}'::jsonb)) AS k
    WHERE NOT (k = ANY(v_allowed_fee_keys));

    IF v_disallowed_keys IS NOT NULL AND array_length(v_disallowed_keys, 1) > 0 THEN
      RETURN jsonb_build_object(
        'error', 'fee_breakdown contains disallowed keys',
        'disallowed_keys', to_jsonb(v_disallowed_keys),
        'allowed_keys', to_jsonb(v_allowed_fee_keys)
      );
    END IF;
  END IF;

  -- ==========================================
  -- 7. pricing_model → 必填字段（MVP 硬规则）
  --    这是"不可绕过的安全边界"核心
  -- ==========================================
  v_pricing_model := NULLIF(p_fee_breakdown ->> 'pricing_model', '');

  -- 检查 schema 是否要求 pricing_model
  IF v_fee_schema ? 'required'
     AND v_fee_schema -> 'required' @> '"pricing_model"'::jsonb
     AND v_pricing_model IS NULL THEN
    RETURN jsonb_build_object('error', 'pricing_model is required');
  END IF;

  -- 按 pricing_model 校验必填字段
  IF v_pricing_model = 'fixed' THEN
    IF p_fee_breakdown -> 'fixed_fee_amount' IS NULL THEN
      RETURN jsonb_build_object('error',
        'fixed_fee_amount is required for fixed pricing_model');
    END IF;

  ELSIF v_pricing_model = 'hourly' THEN
    IF p_fee_breakdown -> 'hourly_rate' IS NULL THEN
      RETURN jsonb_build_object('error',
        'hourly_rate is required for hourly pricing_model');
    END IF;

  ELSIF v_pricing_model = 'blended' THEN
    IF p_fee_breakdown -> 'hourly_rate' IS NULL
       OR p_fee_breakdown -> 'estimated_hours' IS NULL THEN
      RETURN jsonb_build_object('error',
        'hourly_rate and estimated_hours are required for blended pricing_model');
    END IF;

  ELSIF v_pricing_model = 'retainer' THEN
    IF p_fee_breakdown -> 'retainer_amount' IS NULL THEN
      RETURN jsonb_build_object('error',
        'retainer_amount is required for retainer pricing_model');
    END IF;

  ELSIF v_pricing_model = 'conditional' THEN
    -- 高层决策：conditional 不披露 uplift/contingency → 硬拒绝
    IF (p_fee_breakdown -> 'uplift_pct' IS NULL)
       AND (p_fee_breakdown -> 'contingency_pct' IS NULL) THEN
      RETURN jsonb_build_object('error',
        'conditional pricing requires disclosure of uplift_pct or contingency_pct');
    END IF;
  END IF;

  -- ==========================================
  -- 8. evidence_tier 计算（沿用 legacy 逻辑）
  -- ==========================================
  IF p_initial_quote_total IS NOT NULL AND p_final_total_paid IS NOT NULL THEN
    v_evidence_tier := 'B';
  ELSE
    v_evidence_tier := 'C';
  END IF;

  -- ==========================================
  -- 9. visibility + moderation_status
  -- ==========================================
  IF jsonb_array_length(v_risk_flags) > 0 THEN
    v_visibility := 'flagged';
    v_moderation_status := 'flagged';
  END IF;

  -- ==========================================
  -- 10. pseudo_id 生成
  -- ==========================================
  v_pseudo_id := 'user_' || substring(v_user_id::text, 1, 8);

  -- ==========================================
  -- 11. 主表写入（统一事实层）
  -- ==========================================
  INSERT INTO public.fee_entries (
    provider_id,
    submitter_user_id,
    submitter_pseudo_id,
    risk_flags,
    hidden_items,
    quote_transparency_score,
    initial_quote_total,
    final_total_paid,
    evidence_tier,
    evidence_object_key,
    visibility,
    moderation_status,
    -- 行业扩展字段
    industry_key,
    service_key,
    fee_breakdown,
    context
  ) VALUES (
    p_provider_id,
    v_user_id,
    v_pseudo_id,
    v_risk_flags,
    p_hidden_items,
    p_quote_transparency_score,
    p_initial_quote_total,
    p_final_total_paid,
    v_evidence_tier,
    p_evidence_object_key,
    v_visibility,
    v_moderation_status,
    -- 行业扩展
    p_industry_key,
    p_service_key,
    COALESCE(p_fee_breakdown, '{}'::jsonb),
    COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_entry_id;

  -- ==========================================
  -- 12. 审计写入（flagged 时）
  -- ==========================================
  IF v_visibility = 'flagged' THEN
    INSERT INTO public.moderation_actions (
      entry_id, actor_type, actor_id, action, reason, after_snapshot
    ) VALUES (
      v_entry_id, 'system', 'auto_flag', 'flagged',
      'Auto-flagged: ' || v_risk_flags::text,
      jsonb_build_object(
        'visibility', v_visibility,
        'risk_flags', v_risk_flags,
        'industry_key', p_industry_key,
        'service_key', p_service_key
      )
    );
  END IF;

  -- ==========================================
  -- 13. provider 统计更新
  -- ==========================================
  UPDATE public.providers
  SET review_count = review_count + 1,
      last_updated = NOW()
  WHERE id = p_provider_id;

  -- ==========================================
  -- 14. 返回结果
  -- ==========================================
  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'visibility', v_visibility,
    'requires_moderation', (v_visibility = 'flagged'),
    'risk_flags', v_risk_flags,
    'evidence_tier', v_evidence_tier,
    'moderation_status', v_moderation_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- GRANT EXECUTE
-- ==========================================
GRANT EXECUTE ON FUNCTION public.create_fee_entry_v2(
  UUID, TEXT, TEXT, JSONB, JSONB, JSONB, INTEGER, NUMERIC, NUMERIC, TEXT
) TO authenticated;
