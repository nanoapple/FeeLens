-- supabase/migrations/20260219000001_auth3_seed_roles.sql
-- ==========================================
-- Auth-3: Add moderator test user
--
-- IMPORTANT: Migrations run BEFORE seed.sql.
-- Only creates users owned by this migration.
--
-- GoTrue compatibility (Supabase CLI 2.75+):
--   GoTrue crashes on NULL for email_change and similar token columns:
--     "Scan error on column ... converting NULL to string is unsupported"
--   These columns must be '' (empty string).
--
--   HOWEVER, `phone` has a UNIQUE constraint and default NULL.
--   Multiple users with phone='' would violate UNIQUE.
--   phone, phone_change, phone_change_token use table defaults (NULL)
--   because GoTrue handles nullable phone fields correctly (they're
--   optional by design — not all users have phone numbers).
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token,
  -- GoTrue non-nullable string columns (must be '')
  email_change, email_change_token_new, email_change_token_current,
  recovery_token, reauthentication_token,
  -- Boolean columns
  is_sso_user, is_anonymous
  -- NOTE: phone, phone_change, phone_change_token OMITTED
  -- → use table defaults (NULL) to avoid UNIQUE constraint violation
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'mod@feelens.local',
  crypt('modpass123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Moderator User"}'::jsonb,
  FALSE, '',
  '', '', '',
  '', '',
  FALSE, FALSE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '44444444-4444-4444-4444-444444444444',
  '44444444-4444-4444-4444-444444444444',
  '{"sub":"44444444-4444-4444-4444-444444444444","email":"mod@feelens.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role) VALUES
  ('44444444-4444-4444-4444-444444444444', 'moderator')
ON CONFLICT DO NOTHING;
