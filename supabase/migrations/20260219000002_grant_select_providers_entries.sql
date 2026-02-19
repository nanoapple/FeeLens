-- supabase/migrations/20260219000002_grant_select_providers_entries.sql
-- ==========================================
-- Auth-4b Fix: Missing table-level SELECT grants
--
-- Problem: providers and fee_entries have RLS policies defined,
-- but no GRANT SELECT was given to the 'authenticated' role.
-- PostgREST requires BOTH:
--   1. Table-level GRANT (can the role touch this table at all?)
--   2. RLS policy (which rows can they see?)
--
-- Without GRANT, all Server Component queries via
-- createServerSupabaseClient() return empty results,
-- causing "Provider not found" on submit pages.
--
-- This migration is idempotent (GRANT is safe to re-run).
-- ==========================================

-- providers: authenticated users can read (RLS controls which rows)
GRANT SELECT ON providers TO authenticated;

-- fee_entries: authenticated users can read (RLS controls which rows)
GRANT SELECT ON fee_entries TO authenticated;

-- fee_hidden_tags: follows fee_entries visibility
GRANT SELECT ON fee_hidden_tags TO authenticated;

-- disputes: authenticated users can read own disputes (RLS controls)
GRANT SELECT ON disputes TO authenticated;

-- user_roles: users can read own roles (RLS controls)
GRANT SELECT ON user_roles TO authenticated;

-- reports (legacy): authenticated can read (RLS controls)
GRANT SELECT ON reports TO authenticated;

-- moderation_actions: admin only (RLS controls)
GRANT SELECT ON moderation_actions TO authenticated;
