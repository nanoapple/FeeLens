-- supabase/migrations/YYYYMMDD_home_stats_rpc.sql
-- ==========================================
-- Home Stats RPC — server-side aggregation
--
-- Returns all homepage stats in a single DB call:
--   - approved_entries_total (fee_entries.moderation_status='approved')
--   - approved_providers_total (providers.status='approved')
--   - industries_total (industry_schemas.is_active=true)
--   - fees_tracked_total (SUM of display_total from v_public_entries)
--
-- Why RPC instead of N separate queries:
--   1. Single round-trip to DB
--   2. Aggregation happens in Postgres (not Node.js reduce)
--   3. Scales to millions of rows without pulling data over the wire
--
-- Security:
--   SECURITY DEFINER — runs with function owner's privileges
--   Callable by anon + authenticated (public homepage data)
--   Returns only pre-defined aggregate numbers, no row-level data
-- ==========================================

CREATE OR REPLACE FUNCTION rpc_home_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries_total    BIGINT;
  v_providers_total  BIGINT;
  v_industries_total BIGINT;
  v_fees_tracked     DOUBLE PRECISION;
BEGIN
  -- Approved entries (matches v_public_entries filter logic)
  SELECT COUNT(*)
  INTO v_entries_total
  FROM fee_entries
  WHERE moderation_status = 'approved';

  -- Approved providers
  SELECT COUNT(*)
  INTO v_providers_total
  FROM providers
  WHERE status = 'approved';

  -- Active industries
  SELECT COUNT(*)
  INTO v_industries_total
  FROM industry_schemas
  WHERE is_active = true;

  -- Total fees tracked (SUM from the public view, already filtered)
  -- Cast to double precision for stable JSON number serialization
  SELECT COALESCE(SUM(display_total), 0)::double precision
  INTO v_fees_tracked
  FROM v_public_entries
  WHERE display_total IS NOT NULL;

  RETURN jsonb_build_object(
    'approved_entries_total',  v_entries_total,
    'approved_providers_total', v_providers_total,
    'industries_total',         v_industries_total,
    'fees_tracked_total',       v_fees_tracked
  );
END;
$$;

-- Explicit permission: revoke default, then grant only to needed roles
REVOKE ALL ON FUNCTION rpc_home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_home_stats() TO anon, authenticated;
