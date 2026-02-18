-- ==========================================
-- Phase 4-B2: v_public_entries — 统一读模型
--
-- 目的：前端只需要一个查询入口，不用管"数据在旧列还是 JSONB"。
-- 策略：优先读 JSONB，fallback 读旧列（房地产历史数据安全网）。
--
-- 覆盖场景：
--   - 列表页（按 industry/service/state 筛选 + 分页）
--   - 详情页（完整 fee_breakdown + context）
--   - 比较页（同类 entry 并排）
--
-- 安全性：
--   只暴露 public + approved provider 的数据
--   不暴露 submitter_user_id（只用 pseudo_id）
-- ==========================================

CREATE OR REPLACE VIEW public.v_public_entries AS
SELECT
  e.id,
  e.provider_id,
  p.name AS provider_name,
  p.slug AS provider_slug,
  p.state AS provider_state,
  p.postcode AS provider_postcode,
  p.suburb AS provider_suburb,

  -- 行业标识
  e.industry_key,
  e.service_key,

  -- 统一费用明细（JSONB 优先，fallback 旧列）
  CASE
    WHEN e.fee_breakdown != '{}'::jsonb THEN e.fee_breakdown
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'management_fee_pct', e.management_fee_pct,
      'management_fee_incl_gst', e.management_fee_incl_gst,
      'letting_fee_weeks', e.letting_fee_weeks,
      'inspection_fee_fixed', e.inspection_fee_fixed,
      'repair_margin_pct', e.repair_margin_pct,
      'break_fee_amount', e.break_fee_amount
    ))
  END AS fee_breakdown,

  -- 统一上下文（JSONB 优先，fallback 旧列）
  CASE
    WHEN e.context != '{}'::jsonb THEN e.context
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'property_type', e.property_type
    ))
  END AS context,

  -- 摘要字段（列表页快速显示）
  COALESCE(
    e.fee_breakdown ->> 'pricing_model',
    'legacy'
  ) AS pricing_model,
  COALESCE(
    (e.fee_breakdown ->> 'total_estimated')::numeric,
    e.final_total_paid,
    e.initial_quote_total
  ) AS display_total,

  -- 公共元数据
  e.submitter_pseudo_id,
  e.evidence_tier,
  e.quote_transparency_score,
  e.hidden_items,
  e.risk_flags,
  e.visibility,
  e.moderation_status,
  e.dispute_status,

  -- 费用差异（房地产专用，其他行业为 NULL）
  e.initial_quote_total,
  e.final_total_paid,
  e.delta_pct,

  -- 时间
  e.submit_date,
  e.expiry_date,
  e.created_at

FROM fee_entries e
JOIN providers p ON p.id = e.provider_id
WHERE e.visibility = 'public'
  AND p.status = 'approved';

-- ==========================================
-- 权限：所有人可读此 view（对应 fee_entries 的 public_read 策略）
-- ==========================================
GRANT SELECT ON public.v_public_entries TO authenticated, anon;

-- ==========================================
-- 使用示例：
--
-- 列表页（法律服务 - NSW）：
--   SELECT * FROM v_public_entries
--   WHERE industry_key = 'legal_services'
--     AND provider_state = 'NSW'
--   ORDER BY created_at DESC
--   LIMIT 20;
--
-- 列表页（房地产 - 按 provider）：
--   SELECT * FROM v_public_entries
--   WHERE industry_key = 'real_estate'
--     AND provider_id = '...'
--   ORDER BY submit_date DESC;
--
-- 详情页：
--   SELECT * FROM v_public_entries WHERE id = '...';
-- ==========================================
