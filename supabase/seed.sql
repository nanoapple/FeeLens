-- ==========================================
-- FeeLens — Seed Data (idempotent / repeatable)
-- Location: supabase/seed.sql
-- Run: supabase db reset
-- ==========================================

-- ==========================================
-- 0) Guard: ensure required extensions
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1) Test users (auth.users + auth.identities)
-- ==========================================

-- User 1: normal
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'test@feelens.local',
  crypt('testpass123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Test User"}'::jsonb,
  FALSE, ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"test@feelens.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- User 2: admin
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'admin@feelens.local',
  crypt('adminpass123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Admin User"}'::jsonb,
  FALSE, ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@feelens.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- User 3: normal (for multi-user governance tests)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated',
  'user2@feelens.local',
  crypt('testpass123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Second User"}'::jsonb,
  FALSE, ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"user2@feelens.local"}'::jsonb,
  'email', NOW(), NOW(), NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- ==========================================
-- 2) User roles
-- ==========================================
INSERT INTO user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'user')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 3) Providers — real_estate approved (10)
-- ==========================================
INSERT INTO providers (
  id, name, slug, state, postcode, suburb, geo_lat, geo_lng,
  canonical_website, abn, status, source, industry_tags
) VALUES
  ('00000000-0000-0000-0000-000000000101', 'Ray White Sydney CBD',       'ray-white-sydney-cbd',       'NSW', '2000', 'Sydney',       -33.8688, 151.2093, 'raywhite.com',         '12345678901', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000102', 'LJ Hooker Bondi',            'lj-hooker-bondi',            'NSW', '2026', 'Bondi',        -33.8908, 151.2743, 'ljhooker.com.au',      '23456789012', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000103', 'Raine & Horne Melbourne',    'raine-horne-melbourne',      'VIC', '3000', 'Melbourne',    -37.8136, 144.9631, 'rainehorne.com.au',    '34567890123', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000104', 'McGrath Estate Agents',      'mcgrath-estate-agents',      'NSW', '2060', 'North Sydney', -33.8382, 151.2070, 'mcgrath.com.au',       '45678901234', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000105', 'First National Brisbane',    'first-national-brisbane',    'QLD', '4000', 'Brisbane',     -27.4698, 153.0251, 'firstnational.com.au', '56789012345', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000106', 'Belle Property Paddington',  'belle-property-paddington',  'NSW', '2021', 'Paddington',   -33.8886, 151.2296, 'belleproperty.com',    '67890123456', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000107', 'PRD Nationwide Melbourne',   'prd-nationwide-melbourne',   'VIC', '3000', 'Melbourne',    -37.8139, 144.9646, 'prd.com.au',           '78901234567', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000108', 'Harcourts Sydney',           'harcourts-sydney',           'NSW', '2000', 'Sydney',       -33.8686, 151.2099, 'harcourts.com.au',     '89012345678', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000109', 'Harris Real Estate Adelaide','harris-real-estate-adelaide','SA',  '5000', 'Adelaide',     -34.9285, 138.6007, 'harrisre.com.au',      '90123456789', 'approved', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000110', 'Realmark Perth',             'realmark-perth',             'WA',  '6000', 'Perth',        -31.9505, 115.8605, 'realmark.com.au',      '01234567890', 'approved', 'seed', ARRAY['real_estate'])
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 4) Providers — real_estate pending (2) [ID range moved to avoid legal provider conflict]
-- ==========================================
INSERT INTO providers (id, name, slug, state, postcode, suburb, status, source, industry_tags) VALUES
  ('00000000-0000-0000-0000-000000000901', 'Test Property Management', 'test-property-management', 'NSW', '2000', 'Sydney',    'pending', 'seed', ARRAY['real_estate']),
  ('00000000-0000-0000-0000-000000000902', 'Sample Realty Group',      'sample-realty-group',      'VIC', '3000', 'Melbourne', 'pending', 'seed', ARRAY['real_estate'])
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 5) Providers — legal_services approved (4) [kept as 0201-0204]
-- ==========================================
INSERT INTO providers (
  id, name, slug, category,
  state, postcode, suburb,
  abn, status, source, industry_tags, provider_type
) VALUES
  ('00000000-0000-0000-0000-000000000201', 'Sydney Conveyancing Group',       'sydney-conveyancing-group',       'legal_services', 'NSW', '2000', 'Sydney CBD',     '11222333444', 'approved', 'seed', ARRAY['legal_services'], 'business'),
  ('00000000-0000-0000-0000-000000000202', 'WorkCover Legal Partners',        'workcover-legal-partners',        'legal_services', 'NSW', '2150', 'Parramatta',     '22333444555', 'approved', 'seed', ARRAY['legal_services'], 'business'),
  ('00000000-0000-0000-0000-000000000203', 'Melbourne Family Law Centre',     'melbourne-family-law-centre',     'legal_services', 'VIC', '3000', 'Melbourne CBD',  '33444555666', 'approved', 'seed', ARRAY['legal_services'], 'business'),
  ('00000000-0000-0000-0000-000000000204', 'Visa Path Migration Services',    'visa-path-migration',             'legal_services', 'QLD', '4000', 'Brisbane CBD',   '44555666777', 'approved', 'seed', ARRAY['legal_services'], 'individual')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 6) Fee Entries — real_estate public (8)
--    Note: legacy columns set for compatibility; also set industry_key/service_key + moderation_status
-- ==========================================
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key,
  property_type, management_fee_pct, management_fee_incl_gst,
  letting_fee_weeks, hidden_items, quote_transparency_score,
  initial_quote_total, final_total_paid,
  evidence_tier, visibility, moderation_status
) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'real_estate', 'property_management',
   'apartment', 8.5, true, 1.0, '["annual_report_fee"]'::jsonb, 4, 1000.00, 1080.00, 'B', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'real_estate', 'property_management',
   'apartment', 9.0, true, 1.5, '["card_surcharge","admin_fee"]'::jsonb, 3, 1200.00, 1350.00, 'B', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'real_estate', 'property_management',
   'house', 7.0, true, 1.0, '["maintenance_markup"]'::jsonb, 5, 1500.00, 1550.00, 'B', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000103', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'real_estate', 'property_management',
   'apartment', 10.0, true, 2.0, '["annual_report_fee","inspection_report_fee","late_payment_fee"]'::jsonb, 2, 800.00, 950.00, 'C', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000104', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'real_estate', 'property_management',
   'apartment', 8.0, true, 1.0, '["card_surcharge"]'::jsonb, 2, 900.00, 1050.00, 'C', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000106', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'real_estate', 'property_management',
   'apartment', 7.5, true, 1.0, '["annual_report_fee"]'::jsonb, 4, 950.00, 1020.00, 'B', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000109', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'real_estate', 'property_management',
   'house', 7.8, true, 1.0, '["advertising_fee"]'::jsonb, 3, 1100.00, 1180.00, 'C', 'public', 'approved'),

  ('aaaaaaaa-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000110', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'real_estate', 'property_management',
   'house', 8.2, true, 1.5, '["maintenance_markup","card_surcharge"]'::jsonb, 3, 1300.00, 1420.00, 'B', 'public', 'approved')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 7) Fee Entry — neutral public (submitter_user_id NULL) for governance regression
-- ==========================================
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key,
  property_type, management_fee_pct, management_fee_incl_gst,
  letting_fee_weeks, hidden_items, quote_transparency_score,
  initial_quote_total, final_total_paid,
  evidence_tier, visibility, moderation_status
) VALUES (
  'aaaaaaaa-0000-0000-0000-00000000ff01',
  '00000000-0000-0000-0000-000000000101',
  NULL, 'seed_neutral',
  'real_estate', 'property_management',
  'apartment', 8.1, true,
  1.0, '[]'::jsonb, 4,
  1000.00, 1040.00,
  'C', 'public', 'approved'
) ON CONFLICT DO NOTHING;

-- ==========================================
-- 8) Fee Entries — real_estate flagged (2) for admin queue
-- ==========================================
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key,
  property_type, management_fee_pct, management_fee_incl_gst,
  letting_fee_weeks, hidden_items, quote_transparency_score,
  initial_quote_total, final_total_paid,
  evidence_tier, visibility, moderation_status, risk_flags
) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'real_estate', 'property_management',
   'commercial', 16.0, true, 2.5, '["annual_report_fee","card_surcharge","insurance_admin","after_hours_fee"]'::jsonb, 1,
   2000.00, 2650.00, 'C', 'flagged', 'flagged', '["extreme_value"]'::jsonb),

  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000107', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'real_estate', 'property_management',
   'apartment', 12.0, true, 2.0, '["letting_fee_hidden","break_fee_undisclosed"]'::jsonb, 1,
   700.00, 980.00, 'C', 'flagged', 'flagged', '["high_frequency","extreme_value"]'::jsonb)
ON CONFLICT DO NOTHING;

-- ==========================================
-- 9) Dispute (1 pending) + sync dispute_status on entry
-- ==========================================
INSERT INTO disputes (
  id, entry_id, provider_verification_method, provider_contact, provider_claim, status
) VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'email_verified',
  'manager@raywhite-demo.com',
  'Our actual management fee is 7.7% inclusive of GST. The 9% figure includes a one-off letting fee that was separately disclosed.',
  'pending'
) ON CONFLICT DO NOTHING;

UPDATE fee_entries
SET dispute_status = 'pending'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ==========================================
-- 10) Governance fixtures: entry_reports (open)
--     (Do NOT seed legacy reports table)
-- ==========================================
INSERT INTO entry_reports (id, entry_id, reporter_user_id, reason_code, report_text, status) VALUES
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000007',
   '33333333-3333-3333-3333-333333333333',
   'price_incorrect', 'Management fee is actually 7.2%, not 7.8%.', 'open'),

  ('cccccccc-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'duplicate', 'Appears to duplicate another Ray White entry.', 'open')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 11) Moderation actions (sample)
-- ==========================================
INSERT INTO moderation_actions (id, entry_id, actor_type, actor_id, action, reason) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'system', 'auto_flag', 'flagged',
   'Extreme fee value detected: 16.0% exceeds threshold'),

  ('eeeeeeee-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'system', 'auto_flag', 'flagged',
   'Multiple risk flags: high_frequency, extreme_value')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 12) Provider actions (sample)
-- ==========================================
INSERT INTO provider_actions (id, provider_id, actor_id, actor_type, action, old_status, new_status, reason) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000101',
   '22222222-2222-2222-2222-222222222222',
   'admin', 'approve', 'pending', 'approved',
   'Real estate agency verified via ABN lookup')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 13) Legal fee entries (8) — UUID block cccccccc-1000-... (no collision with flagged)
-- ==========================================

-- Conveyancing (2)
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key, fee_breakdown, context,
  evidence_tier, visibility, moderation_status
) VALUES
  ('cccccccc-1000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000201',
   '11111111-1111-1111-1111-111111111111', 'user_test1',
   'legal_services', 'conveyancing',
   '{
     "pricing_model": "hourly",
     "hourly_rate": 350,
     "estimated_hours": 8,
     "gst_included": true,
     "disbursements_items": [
       {"label":"Title search","amount":30,"is_estimate":false},
       {"label":"Registration fee","amount":150,"is_estimate":false},
       {"label":"Council & water certificates","amount":85,"is_estimate":true}
     ],
     "disbursements_total": 265,
     "total_estimated": 3065
   }'::jsonb,
   '{
     "matter_type":"conveyancing",
     "jurisdiction":"NSW",
     "client_type":"individual",
     "complexity_band":"medium",
     "property_value":1200000,
     "transaction_side":"buyer",
     "property_type":"unit"
   }'::jsonb,
   'C','public','approved'),

  ('cccccccc-1000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000201',
   '33333333-3333-3333-3333-333333333333', 'user_test3',
   'legal_services', 'conveyancing',
   '{
     "pricing_model": "fixed",
     "fixed_fee_amount": 1650,
     "gst_included": true,
     "disbursements_items": [
       {"label":"Title search","amount":30,"is_estimate":false},
       {"label":"Registration fee","amount":150,"is_estimate":false}
     ],
     "disbursements_total": 180,
     "total_estimated": 1830
   }'::jsonb,
   '{
     "matter_type":"conveyancing",
     "jurisdiction":"NSW",
     "client_type":"individual",
     "complexity_band":"low",
     "property_value":750000,
     "transaction_side":"seller",
     "property_type":"house"
   }'::jsonb,
   'C','public','approved')
ON CONFLICT DO NOTHING;

-- Workers compensation (2)
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key, fee_breakdown, context,
  evidence_tier, visibility, moderation_status
) VALUES
  ('cccccccc-1000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000202',
   '11111111-1111-1111-1111-111111111111', 'user_test1',
   'legal_services', 'workers_compensation',
   '{
     "pricing_model":"hourly",
     "hourly_rate":450,
     "estimated_hours":15,
     "gst_included":true,
     "disbursements_items":[
       {"label":"Medical report","amount":800,"is_estimate":true},
       {"label":"Court filing fee","amount":120,"is_estimate":false}
     ],
     "disbursements_total":920,
     "total_estimated":7670
   }'::jsonb,
   '{
     "matter_type":"workers_compensation",
     "jurisdiction":"NSW",
     "client_type":"individual",
     "complexity_band":"high",
     "claim_stage":"liability",
     "damages_claim":true,
     "estimated_claim_value":85000
   }'::jsonb,
   'C','public','approved'),

  ('cccccccc-1000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000202',
   '33333333-3333-3333-3333-333333333333', 'user_test3',
   'legal_services', 'workers_compensation',
   '{
     "pricing_model":"fixed",
     "fixed_fee_amount":2200,
     "gst_included":true,
     "total_estimated":2200
   }'::jsonb,
   '{
     "matter_type":"workers_compensation",
     "jurisdiction":"NSW",
     "client_type":"individual",
     "complexity_band":"low",
     "claim_stage":"pre-lodgement",
     "damages_claim":false
   }'::jsonb,
   'C','public','approved')
ON CONFLICT DO NOTHING;

-- Family law (2)
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key, fee_breakdown, context,
  evidence_tier, visibility, moderation_status
) VALUES
  ('cccccccc-1000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000203',
   '11111111-1111-1111-1111-111111111111', 'user_test1',
   'legal_services', 'family_law',
   '{
     "pricing_model":"hourly",
     "hourly_rate":500,
     "estimated_hours":20,
     "gst_included":true,
     "disbursements_items":[
       {"label":"Court filing fee","amount":370,"is_estimate":false},
       {"label":"Process server","amount":120,"is_estimate":true},
       {"label":"Valuation report","amount":1500,"is_estimate":true}
     ],
     "disbursements_total":1990,
     "total_estimated":11990
   }'::jsonb,
   '{
     "matter_type":"family_law",
     "jurisdiction":"VIC",
     "client_type":"individual",
     "complexity_band":"high",
     "court_stage":"interim",
     "children_involved":true
   }'::jsonb,
   'C','public','approved'),

  ('cccccccc-1000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000203',
   '33333333-3333-3333-3333-333333333333', 'user_test3',
   'legal_services', 'family_law',
   '{
     "pricing_model":"fixed",
     "fixed_fee_amount":3500,
     "gst_included":true,
     "disbursements_items":[{"label":"Court filing fee","amount":170,"is_estimate":false}],
     "disbursements_total":170,
     "total_estimated":3670
   }'::jsonb,
   '{
     "matter_type":"family_law",
     "jurisdiction":"VIC",
     "client_type":"individual",
     "complexity_band":"medium",
     "court_stage":"consent_orders",
     "children_involved":false
   }'::jsonb,
   'C','public','approved')
ON CONFLICT DO NOTHING;

-- Migration (2)
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  industry_key, service_key, fee_breakdown, context,
  evidence_tier, visibility, moderation_status
) VALUES
  ('cccccccc-1000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000204',
   '11111111-1111-1111-1111-111111111111', 'user_test1',
   'legal_services', 'migration',
   '{
     "pricing_model":"hourly",
     "hourly_rate":380,
     "estimated_hours":10,
     "gst_included":true,
     "disbursements_items":[
       {"label":"Visa application fee","amount":4115,"is_estimate":false},
       {"label":"Skills assessment","amount":500,"is_estimate":true},
       {"label":"Health check","amount":350,"is_estimate":true}
     ],
     "disbursements_total":4965,
     "total_estimated":8765
   }'::jsonb,
   '{
     "matter_type":"migration",
     "jurisdiction":"QLD",
     "client_type":"individual",
     "complexity_band":"medium",
     "visa_type":"subclass_482",
     "application_stage":"pre-lodgement"
   }'::jsonb,
   'C','public','approved'),

  ('cccccccc-1000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000204',
   '33333333-3333-3333-3333-333333333333', 'user_test3',
   'legal_services', 'migration',
   '{
     "pricing_model":"fixed",
     "fixed_fee_amount":5500,
     "gst_included":true,
     "disbursements_items":[{"label":"Visa application fee","amount":8085,"is_estimate":false}],
     "disbursements_total":8085,
     "total_estimated":13585
   }'::jsonb,
   '{
     "matter_type":"migration",
     "jurisdiction":"QLD",
     "client_type":"individual",
     "complexity_band":"high",
     "visa_type":"subclass_820_801",
     "application_stage":"lodged"
   }'::jsonb,
   'C','public','approved')
ON CONFLICT DO NOTHING;

-- Optional: review_count for legal providers
UPDATE providers SET review_count = 2 WHERE id IN (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000204'
);

-- ==========================================
-- 14) Summary notices
-- ==========================================
DO $$
DECLARE
  v_users_count       INT;
  v_providers_ok      INT;
  v_providers_pending INT;
  v_entries_public    INT;
  v_entries_flagged   INT;
  v_open_reports      INT;
  v_pending_disputes  INT;
BEGIN
  SELECT COUNT(*) INTO v_users_count       FROM auth.users WHERE email LIKE '%feelens.local';
  SELECT COUNT(*) INTO v_providers_ok      FROM providers WHERE status='approved';
  SELECT COUNT(*) INTO v_providers_pending FROM providers WHERE status='pending';
  SELECT COUNT(*) INTO v_entries_public    FROM fee_entries WHERE visibility='public';
  SELECT COUNT(*) INTO v_entries_flagged   FROM fee_entries WHERE visibility='flagged';
  SELECT COUNT(*) INTO v_open_reports      FROM entry_reports WHERE status IN ('open','triaged');
  SELECT COUNT(*) INTO v_pending_disputes  FROM disputes WHERE status='pending';

  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  FeeLens Seed 数据加载完成';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  测试用户:          % 个', v_users_count;
  RAISE NOTICE '    test@feelens.local   / testpass123  (普通用户)';
  RAISE NOTICE '    admin@feelens.local  / adminpass123 (管理员)';
  RAISE NOTICE '    user2@feelens.local  / testpass123  (第二个普通用户)';
  RAISE NOTICE '  Approved Providers:  %', v_providers_ok;
  RAISE NOTICE '  Pending Providers:   %', v_providers_pending;
  RAISE NOTICE '  Public Entries:      %', v_entries_public;
  RAISE NOTICE '  Flagged Entries:     %', v_entries_flagged;
  RAISE NOTICE '  Open Reports:        %', v_open_reports;
  RAISE NOTICE '  Pending Disputes:    %', v_pending_disputes;
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
END $$;