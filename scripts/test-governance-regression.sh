#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# FeeLens Governance Regression Tests (DB-level)
# - Requires: psql, supabase CLI (optional for auto DB URL detection)
# - Uses auth.users emails seeded by supabase/seed.sql
# ------------------------------------------------------------

# Resolve DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  if command -v supabase >/dev/null 2>&1; then
    # Example line: "DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    DATABASE_URL="$(supabase status 2>/dev/null | awk -F': ' '/DB URL/ {print $2}' | head -n 1 || true)"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set and could not be inferred from 'supabase status'."
  echo "Set it manually, e.g.:"
  echo "  export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'"
  exit 1
fi

echo "Using DATABASE_URL: ${DATABASE_URL}"

# Helper runner
run_psql() {
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -X -q "$@"
}

echo "==> Governance regression tests starting..."

run_psql <<'SQL'
DO $$
BEGIN
  -- Basic preflight: ensure required tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fee_entries') THEN
    RAISE EXCEPTION 'Missing table: public.fee_entries';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='entry_reports') THEN
    RAISE EXCEPTION 'Missing table: public.entry_reports';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_actions') THEN
    RAISE EXCEPTION 'Missing table: public.provider_actions';
  END IF;

  -- Functions existence check (public schema)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='report_entry'
  ) THEN
    RAISE EXCEPTION 'Missing function: public.report_entry';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='moderate_entry'
  ) THEN
    RAISE EXCEPTION 'Missing function: public.moderate_entry';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='approve_provider'
  ) THEN
    RAISE EXCEPTION 'Missing function: public.approve_provider';
  END IF;
END $$;
SQL

echo "==> [1/3] report_entry -> entry_reports -> auto-flag"

run_psql <<'SQL'
DO $$
DECLARE
  v_user1 uuid;
  v_user2 uuid;
  v_admin uuid;

  v_entry uuid;
  v_submitter uuid;

  r1 uuid;
  r2 uuid;
  r3 uuid;

  v_res jsonb;
  v_open_count int;
  v_visibility text;
  v_mod_status text;
BEGIN
  SELECT id INTO v_user1 FROM auth.users WHERE email='test@feelens.local';
  SELECT id INTO v_user2 FROM auth.users WHERE email='user2@feelens.local';
  SELECT id INTO v_admin FROM auth.users WHERE email='admin@feelens.local';

  IF v_user1 IS NULL OR v_user2 IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'Seed users missing in auth.users (expected test/user2/admin)';
  END IF;

  -- 优先选中立 entry（submitter_user_id IS NULL），否则退化为任意 public entry
  SELECT id, submitter_user_id
    INTO v_entry, v_submitter
  FROM public.fee_entries
  WHERE visibility='public'
  ORDER BY (submitter_user_id IS NULL) DESC, created_at DESC
  LIMIT 1;

  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'No public fee_entry found for report test';
  END IF;

  -- 选择 3 个 reporter，避免自举报（若 submitter_user_id 为 NULL 则无所谓）
  r1 := v_user1;
  r2 := v_user2;
  r3 := v_admin;

  IF v_submitter IS NOT NULL THEN
    IF r1 = v_submitter THEN r1 := v_user2; END IF;
    IF r2 = v_submitter THEN r2 := v_admin; END IF;
    IF r3 = v_submitter THEN r3 := v_user1; END IF;

    IF r1 = v_submitter OR r2 = v_submitter OR r3 = v_submitter THEN
      RAISE EXCEPTION 'Unable to select reporters not equal to submitter_user_id (%) for entry %', v_submitter, v_entry;
    END IF;
  END IF;

  -- 清理旧报告，保证可重复
  DELETE FROM public.entry_reports
  WHERE entry_id = v_entry
    AND reporter_user_id IN (v_user1, v_user2, v_admin);

  -- 恢复 entry 基线，保证 auto-flag 断言稳定
  UPDATE public.fee_entries
  SET visibility='public',
      moderation_status='approved',
      updated_at=NOW()
  WHERE id=v_entry;

  -- helper: set claims so auth.uid() can read them
  -- (set_config value must be TEXT)
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Report #1
  PERFORM set_config('request.jwt.claim.sub', r1::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r1::text, 'role', 'authenticated')::text, true);
  v_res := public.report_entry(v_entry, 'price_incorrect', 'test report 1');
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'report_entry #1 failed: %', v_res;
  END IF;

  -- Report #2
  PERFORM set_config('request.jwt.claim.sub', r2::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r2::text, 'role', 'authenticated')::text, true);
  v_res := public.report_entry(v_entry, 'price_incorrect', 'test report 2');
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'report_entry #2 failed: %', v_res;
  END IF;

  -- Report #3
  PERFORM set_config('request.jwt.claim.sub', r3::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r3::text, 'role', 'authenticated')::text, true);
  v_res := public.report_entry(v_entry, 'price_incorrect', 'test report 3');
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'report_entry #3 failed: %', v_res;
  END IF;

  -- 验证插入
  SELECT COUNT(*) INTO v_open_count
  FROM public.entry_reports
  WHERE entry_id=v_entry AND status='open';

  IF v_open_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 open entry_reports, got %', v_open_count;
  END IF;

  -- 验证 auto-flag
  SELECT visibility, moderation_status INTO v_visibility, v_mod_status
  FROM public.fee_entries WHERE id=v_entry;

  IF v_visibility <> 'flagged' THEN
    RAISE EXCEPTION 'Expected fee_entry.visibility=flagged after 3 reports, got %', v_visibility;
  END IF;

  IF v_mod_status <> 'flagged' THEN
    RAISE EXCEPTION 'Expected fee_entry.moderation_status=flagged after 3 reports, got %', v_mod_status;
  END IF;
END $$;
SQL

echo "==> [2/3] moderate_entry -> sync moderation fields + resolve entry_reports"

run_psql <<'SQL'
DO $$
DECLARE
  v_admin uuid;
  v_entry uuid;
  v_visibility text;
  v_mod_status text;
  v_moderated_by uuid;
  v_moderated_at timestamptz;
  v_open_left int;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email='admin@feelens.local';
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin user missing in auth.users';
  END IF;

  -- Use the most recently flagged entry that has open reports
  SELECT e.id INTO v_entry
  FROM public.fee_entries e
  WHERE e.visibility='flagged'
    AND EXISTS (
      SELECT 1 FROM public.entry_reports r
      WHERE r.entry_id=e.id AND r.status='open'
    )
  ORDER BY e.updated_at DESC
  LIMIT 1;

  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'No flagged fee_entry with open reports found for moderation test';
  END IF;

  -- Call moderate_entry as admin
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_entry(v_entry, 'approve', 'regression approve');

  SELECT visibility, moderation_status, moderated_by, moderated_at
    INTO v_visibility, v_mod_status, v_moderated_by, v_moderated_at
  FROM public.fee_entries
  WHERE id=v_entry;

  IF v_visibility <> 'public' THEN
    RAISE EXCEPTION 'Expected visibility=public after approve, got %', v_visibility;
  END IF;

  IF v_mod_status <> 'approved' THEN
    RAISE EXCEPTION 'Expected moderation_status=approved after approve, got %', v_mod_status;
  END IF;

  IF v_moderated_by IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Expected moderated_by=admin (%), got %', v_admin, v_moderated_by;
  END IF;

  IF v_moderated_at IS NULL THEN
    RAISE EXCEPTION 'Expected moderated_at to be set';
  END IF;

  SELECT COUNT(*) INTO v_open_left
  FROM public.entry_reports
  WHERE entry_id=v_entry AND status IN ('open','triaged');

  IF v_open_left <> 0 THEN
    RAISE EXCEPTION 'Expected 0 open/triaged entry_reports after approve, got %', v_open_left;
  END IF;
END $$;
SQL

echo "==> [3/3] approve_provider -> provider_actions + status_changed_*"

run_psql <<'SQL'
DO $$
DECLARE
  v_admin uuid;
  v_provider uuid;
  v_old_status text;
  v_new_status text;
  v_changed_by uuid;
  v_changed_at timestamptz;
  v_actions int;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email='admin@feelens.local';
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin user missing in auth.users';
  END IF;

  -- Choose a pending provider
  SELECT id, status INTO v_provider, v_old_status
  FROM public.providers
  WHERE status='pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'No pending provider found for approval test';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.approve_provider(v_provider, 'approve', 'regression approve provider');

  SELECT status, status_changed_by, status_changed_at
    INTO v_new_status, v_changed_by, v_changed_at
  FROM public.providers
  WHERE id=v_provider;

  IF v_new_status <> 'approved' THEN
    RAISE EXCEPTION 'Expected provider.status=approved, got %', v_new_status;
  END IF;

  IF v_changed_by IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Expected providers.status_changed_by=admin (%), got %', v_admin, v_changed_by;
  END IF;

  IF v_changed_at IS NULL THEN
    RAISE EXCEPTION 'Expected providers.status_changed_at to be set';
  END IF;

  SELECT COUNT(*) INTO v_actions
  FROM public.provider_actions
  WHERE provider_id=v_provider
    AND actor_id=v_admin
    AND old_status=v_old_status
    AND new_status='approved';

  IF v_actions < 1 THEN
    RAISE EXCEPTION 'Expected provider_actions row for approval, got %', v_actions;
  END IF;
END $$;
SQL

echo "✅ Governance regression tests PASSED"