-- ==========================================
-- FeeLens MVP — Seed 数据（可重复运行）
-- 位置：supabase/seed.sql（唯一 seed 文件）
-- 执行：supabase db reset 时自动加载
-- 
-- ⚠️ supabase/migrations/seed.sql 应当删除
-- ==========================================

-- ==========================================
-- 1. 测试用户（auth.users + auth.identities）
-- ==========================================

-- 用户 1：普通用户
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

-- 用户 2：管理员
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

-- 用户 3：第二个普通用户（用于举报/多用户测试）
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
-- 2. 用户角色
-- ==========================================
INSERT INTO user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'user')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 3. Providers — 已审核通过（8 个，覆盖 5 个州）
-- ==========================================
INSERT INTO providers (id, name, slug, state, postcode, suburb, geo_lat, geo_lng, canonical_website, abn, status, source) VALUES
  -- NSW
  ('00000000-0000-0000-0000-000000000101', 'Ray White Sydney CBD',       'ray-white-sydney-cbd',       'NSW', '2000', 'Sydney',       -33.8688, 151.2093, 'raywhite.com',           '12345678901', 'approved', 'seed'),
  ('00000000-0000-0000-0000-000000000102', 'LJ Hooker Bondi',            'lj-hooker-bondi',            'NSW', '2026', 'Bondi',        -33.8908, 151.2743, 'ljhooker.com.au',        '23456789012', 'approved', 'seed'),
  ('00000000-0000-0000-0000-000000000104', 'McGrath Estate Agents',      'mcgrath-estate-agents',      'NSW', '2060', 'North Sydney', -33.8382, 151.2070, 'mcgrath.com.au',         '45678901234', 'approved', 'seed'),
  ('00000000-0000-0000-0000-000000000106', 'Belle Property Paddington',  'belle-property-paddington',  'NSW', '2021', 'Paddington',   -33.8886, 151.2296, 'belleproperty.com',      '67890123456', 'approved', 'seed'),
  ('00000000-0000-0000-0000-000000000108', 'Harcourts Sydney',           'harcourts-sydney',           'NSW', '2000', 'Sydney',       -33.8686, 151.2099, 'harcourts.com.au',       '89012345678', 'approved', 'seed'),
  -- VIC
  ('00000000-0000-0000-0000-000000000103', 'Raine & Horne Melbourne',   'raine-horne-melbourne',      'VIC', '3000', 'Melbourne',    -37.8136, 144.9631, 'rainehorne.com.au',      '34567890123', 'approved', 'seed'),
  ('00000000-0000-0000-0000-000000000107', 'PRD Nationwide Melbourne',   'prd-nationwide-melbourne',   'VIC', '3000', 'Melbourne',    -37.8139, 144.9646, 'prd.com.au',             '78901234567', 'approved', 'seed'),
  -- QLD
  ('00000000-0000-0000-0000-000000000105', 'First National Brisbane',    'first-national-brisbane',    'QLD', '4000', 'Brisbane',     -27.4698, 153.0251, 'firstnational.com.au',   '56789012345', 'approved', 'seed'),
  -- SA
  ('00000000-0000-0000-0000-000000000109', 'Harris Real Estate Adelaide','harris-real-estate-adelaide', 'SA', '5000', 'Adelaide',     -34.9285, 138.6007, 'harrisre.com.au',        '90123456789', 'approved', 'seed'),
  -- WA
  ('00000000-0000-0000-0000-000000000110', 'Realmark Perth',             'realmark-perth',             'WA',  '6000', 'Perth',        -31.9505, 115.8605, 'realmark.com.au',        '01234567890', 'approved', 'seed')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 4. Providers — 待审核（2 个，用于 admin 审核测试）
-- ==========================================
INSERT INTO providers (id, name, slug, state, postcode, suburb, status, source) VALUES
  ('00000000-0000-0000-0000-000000000201', 'Test Property Management', 'test-property-management', 'NSW', '2000', 'Sydney',    'pending', 'seed'),
  ('00000000-0000-0000-0000-000000000202', 'Sample Realty Group',      'sample-realty-group',      'VIC', '3000', 'Melbourne', 'pending', 'seed')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 5. Fee Entries — public 状态（6 条，前端列表可见）
-- ==========================================
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  property_type, management_fee_pct, management_fee_incl_gst,
  letting_fee_weeks, hidden_items, quote_transparency_score,
  initial_quote_total, final_total_paid,
  evidence_tier, visibility
) VALUES
  -- Ray White Sydney CBD — 正常
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'apartment', 8.5, true, 1.0,
   '["annual_report_fee"]'::jsonb, 4,
   1000.00, 1080.00, 'B', 'public'),

  -- Ray White Sydney CBD — 偏高
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000101', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'apartment', 9.0, true, 1.5,
   '["card_surcharge","admin_fee"]'::jsonb, 3,
   1200.00, 1350.00, 'B', 'public'),

  -- LJ Hooker Bondi — 高透明度
  ('aaaaaaaa-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'house', 7.0, true, 1.0,
   '["maintenance_markup"]'::jsonb, 5,
   1500.00, 1550.00, 'B', 'public'),

  -- Raine & Horne Melbourne — 多隐藏费用
  ('aaaaaaaa-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000103', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'apartment', 10.0, true, 2.0,
   '["annual_report_fee","inspection_report_fee","late_payment_fee"]'::jsonb, 2,
   800.00, 950.00, 'C', 'public'),

  -- McGrath — 低透明度
  ('aaaaaaaa-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000104', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'apartment', 8.0, true, 1.0,
   '["card_surcharge"]'::jsonb, 2,
   900.00, 1050.00, 'C', 'public'),

  -- Belle Property Paddington
  ('aaaaaaaa-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000106', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'apartment', 7.5, true, 1.0,
   '["annual_report_fee"]'::jsonb, 4,
   950.00, 1020.00, 'B', 'public'),

  -- Harris Adelaide（新增：SA 覆盖）
  ('aaaaaaaa-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000109', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'house', 7.8, true, 1.0,
   '["advertising_fee"]'::jsonb, 3,
   1100.00, 1180.00, 'C', 'public'),

  -- Realmark Perth（新增：WA 覆盖）
  ('aaaaaaaa-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000110', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'house', 8.2, true, 1.5,
   '["maintenance_markup","card_surcharge"]'::jsonb, 3,
   1300.00, 1420.00, 'B', 'public')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 6. Fee Entries — flagged 状态（2 条，admin 审核队列测试）
-- ==========================================
INSERT INTO fee_entries (
  id, provider_id, submitter_user_id, submitter_pseudo_id,
  property_type, management_fee_pct, management_fee_incl_gst,
  letting_fee_weeks, hidden_items, quote_transparency_score,
  initial_quote_total, final_total_paid,
  evidence_tier, visibility, risk_flags
) VALUES
  -- 极端费率触发风控
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000105', '11111111-1111-1111-1111-111111111111', 'user_test1',
   'commercial', 16.0, true, 2.5,
   '["annual_report_fee","card_surcharge","insurance_admin","after_hours_fee"]'::jsonb, 1,
   2000.00, 2650.00, 'C', 'flagged',
   '["extreme_value"]'::jsonb),

  -- 新商家+高频提交触发风控
  ('bbbbbbbb-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000107', '33333333-3333-3333-3333-333333333333', 'user_test3',
   'apartment', 12.0, true, 2.0,
   '["letting_fee_hidden","break_fee_undisclosed"]'::jsonb, 1,
   700.00, 980.00, 'C', 'flagged',
   '["high_frequency","extreme_value"]'::jsonb)
ON CONFLICT DO NOTHING;

-- ==========================================
-- 7. 举报（reports）— admin 页面测试
-- ==========================================
INSERT INTO reports (id, entry_id, reporter_user_id, reason, details, status) VALUES
  -- 对 flagged entry 的举报
  ('cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333',
   'inaccurate', '费率明显不合理，疑似恶意提交', 'pending'),

  -- 对 public entry 的举报
  ('cccccccc-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'expired', '该费率信息已超过 12 个月', 'pending')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 8. 争议（disputes）— admin 页面测试
-- ==========================================
INSERT INTO disputes (id, entry_id, provider_verification_method, provider_contact, provider_claim, status) VALUES
  -- 对 Ray White 条目的争议
  ('dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'email_verified', 'manager@raywhite-demo.com',
   'Our actual management fee is 7.7% inclusive of GST. The 9% figure is inaccurate and includes a one-off letting fee that was separately disclosed.',
   'pending')
ON CONFLICT DO NOTHING;

-- 更新对应 entry 的 dispute_status
UPDATE fee_entries
SET dispute_status = 'pending'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ==========================================
-- 9. 审计日志（moderation_actions）— 样例
-- ==========================================
INSERT INTO moderation_actions (id, entry_id, actor_type, actor_id, action, reason) VALUES
  -- 系统自动标记
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
-- 10. 验证数据（显示统计）
-- ==========================================
DO $$
DECLARE
  v_users_count      INT;
  v_providers_ok     INT;
  v_providers_pending INT;
  v_entries_public   INT;
  v_entries_flagged  INT;
  v_reports_count    INT;
  v_disputes_count   INT;
BEGIN
  SELECT COUNT(*) INTO v_users_count      FROM auth.users       WHERE email LIKE '%feelens.local';
  SELECT COUNT(*) INTO v_providers_ok     FROM providers         WHERE status = 'approved';
  SELECT COUNT(*) INTO v_providers_pending FROM providers        WHERE status = 'pending';
  SELECT COUNT(*) INTO v_entries_public   FROM fee_entries       WHERE visibility = 'public';
  SELECT COUNT(*) INTO v_entries_flagged  FROM fee_entries       WHERE visibility = 'flagged';
  SELECT COUNT(*) INTO v_reports_count    FROM reports           WHERE status = 'pending';
  SELECT COUNT(*) INTO v_disputes_count   FROM disputes          WHERE status = 'pending';

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
  RAISE NOTICE '  Pending Reports:     %', v_reports_count;
  RAISE NOTICE '  Pending Disputes:    %', v_disputes_count;
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
END $$;


-- 如果迁移已把旧 seed reports 搬过来，这里补充额外的
INSERT INTO entry_reports (id, entry_id, reporter_user_id, reason_code, report_text, status) VALUES
  -- 新增：对 Adelaide entry 的价格不准确举报
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000007',
   '33333333-3333-3333-3333-333333333333',
   'price_incorrect', '管理费实际是 7.2% 而非 7.8%', 'open'),

  -- 新增：重复条目举报
  ('cccccccc-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'duplicate', '与另一条 Ray White 条目高度重复', 'open')
ON CONFLICT DO NOTHING;

-- ==========================================
-- M2 补充：provider_actions 样例数据
-- ==========================================
INSERT INTO provider_actions (id, provider_id, actor_id, actor_type, action, old_status, new_status, reason) VALUES
  -- 模拟 admin 审批 approved providers 的历史记录
  ('eeeeeeee-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000101',
   '22222222-2222-2222-2222-222222222222',
   'admin', 'approve', 'pending', 'approved', 'Real estate agency verified via ABN lookup')
ON CONFLICT DO NOTHING;