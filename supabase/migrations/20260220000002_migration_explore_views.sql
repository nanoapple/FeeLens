-- supabase/migrations/YYYYMMDD_explore_views.sql
-- ==========================================
-- Module B: Explore data layer
--
-- B1.1: Update v_public_entries — add geo_lat, geo_lng
--        (from providers table, already joined)
-- B1.2: Create v_public_providers — approved providers
--        with geo + aggregated entry_count
-- B5:   Ensure geo index on providers (performance guardrail)
--
-- Constraints:
--   - v_public_entries filters: visibility='public' AND moderation_status='approved' AND provider approved
--   - geo_lat/geo_lng come from providers static columns (no runtime calc)
--   - entry_count only counts public+approved+moderated entries (via v_public_entries)
--   - postcode cast to text for safe ilike in API
--   - All views are read-only, no RLS on views
-- ==========================================


-- ==========================================
-- B1.1: Recreate v_public_entries with geo columns
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

  -- Industry
  e.industry_key,
  e.service_key,

  -- Fee breakdown (JSONB priority, fallback legacy columns)
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

  -- Context (JSONB priority, fallback legacy)
  CASE
    WHEN e.context != '{}'::jsonb THEN e.context
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'property_type', e.property_type
    ))
  END AS context,

  -- Display fields
  COALESCE(
    e.fee_breakdown ->> 'pricing_model',
    'legacy'
  ) AS pricing_model,
  COALESCE(
    (e.fee_breakdown ->> 'total_estimated')::numeric,
    e.final_total_paid,
    e.initial_quote_total
  ) AS display_total,

  -- Public metadata
  e.submitter_pseudo_id,
  e.evidence_tier,
  e.quote_transparency_score,
  e.hidden_items,
  e.risk_flags,
  e.visibility,
  e.moderation_status,
  e.dispute_status,

  -- Delta (real_estate specific, NULL for others)
  e.initial_quote_total,
  e.final_total_paid,
  e.delta_pct,

  -- Time
  e.submit_date,
  e.expiry_date,
  e.created_at,

  -- Geo (from providers, static columns)
  p.geo_lat AS geo_lat,
  p.geo_lng AS geo_lng

FROM fee_entries e
JOIN providers p ON p.id = e.provider_id
WHERE e.visibility = 'public'
  AND e.moderation_status = 'approved'
  AND p.status = 'approved';

-- Permissions (same as before)
GRANT SELECT ON public.v_public_entries TO authenticated, anon;


-- ==========================================
-- B1.2: v_public_providers — approved providers with entry_count
-- ==========================================
CREATE OR REPLACE VIEW public.v_public_providers AS
SELECT
  p.id AS provider_id,
  p.name,
  p.slug,
  p.state,
  p.postcode::text AS postcode,
  p.suburb,
  p.geo_lat,
  p.geo_lng,
  p.industry_tags,
  p.status,
  -- Aggregate: count of public+approved entries for this provider
  COALESCE(ec.entry_count, 0)::int AS entry_count
FROM providers p
LEFT JOIN (
  SELECT provider_id, COUNT(*) AS entry_count
  FROM v_public_entries
  GROUP BY provider_id
) ec ON ec.provider_id = p.id
WHERE p.status = 'approved';

GRANT SELECT ON public.v_public_providers TO authenticated, anon;


-- ==========================================
-- B5: Ensure geo index on providers (idempotent)
-- ==========================================
-- This index already exists from initial schema, but ensure it's there
CREATE INDEX IF NOT EXISTS idx_providers_geo
  ON providers(geo_lat, geo_lng)
  WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL;
