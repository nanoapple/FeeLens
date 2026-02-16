-- ==========================================
-- Feelens MVP - Seed 数据（可重复运行）
-- ==========================================

-- ==========================================
-- 1. 创建测试用户到 auth.users（关键步骤）
-- ==========================================

-- 测试用户 1（普通用户）
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'test@feelens.local',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  FALSE,
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 测试用户 1 的身份
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"test@feelens.local"}'::jsonb,
  'email',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 测试用户 2（管理员）
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'admin@feelens.local',
  crypt('adminpass123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  FALSE,
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 测试用户 2 的身份
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@feelens.local"}'::jsonb,
  'email',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ==========================================
-- 2. 添加用户角色
-- ==========================================
INSERT INTO user_roles (user_id, role) VALUES
('11111111-1111-1111-1111-111111111111', 'user'),
('22222222-2222-2222-2222-222222222222', 'admin')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 3. 插入测试 providers（已审核通过）
-- ==========================================
INSERT INTO providers (id, name, slug, state, postcode, suburb, geo_lat, geo_lng, canonical_website, abn, status, source) VALUES
('00000000-0000-0000-0000-000000000101', 'Ray White Sydney CBD', 'ray-white-sydney-cbd', 'NSW', '2000', 'Sydney', -33.8688, 151.2093, 'raywhite.com', '12345678901', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000102', 'LJ Hooker Bondi', 'lj-hooker-bondi', 'NSW', '2026', 'Bondi', -33.8908, 151.2743, 'ljhooker.com.au', '23456789012', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000103', 'Raine & Horne Melbourne', 'raine-horne-melbourne', 'VIC', '3000', 'Melbourne', -37.8136, 144.9631, 'rainehorne.com.au', '34567890123', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000104', 'McGrath Estate Agents', 'mcgrath-estate-agents', 'NSW', '2060', 'North Sydney', -33.8382, 151.2070, 'mcgrath.com.au', '45678901234', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000105', 'First National Brisbane', 'first-national-brisbane', 'QLD', '4000', 'Brisbane', -27.4698, 153.0251, 'firstnational.com.au', '56789012345', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000106', 'Belle Property Paddington', 'belle-property-paddington', 'NSW', '2021', 'Paddington', -33.8886, 151.2296, 'belleproperty.com', '67890123456', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000107', 'PRD Nationwide Melbourne', 'prd-nationwide-melbourne', 'VIC', '3000', 'Melbourne', -37.8139, 144.9646, 'prd.com.au', '78901234567', 'approved', 'seed'),
('00000000-0000-0000-0000-000000000108', 'Harcourts Sydney', 'harcourts-sydney', 'NSW', '2000', 'Sydney', -33.8686, 151.2099, 'harcourts.com.au', '89012345678', 'approved', 'seed')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 4. 插入测试 providers（待审核）
-- ==========================================
INSERT INTO providers (id, name, slug, state, postcode, suburb, status, source) VALUES
('00000000-0000-0000-0000-000000000201', 'Test Property Management', 'test-property-management', 'NSW', '2000', 'Sydney', 'pending', 'seed'),
('00000000-0000-0000-0000-000000000202', 'Sample Realty Group', 'sample-realty-group', 'VIC', '3000', 'Melbourne', 'pending', 'seed')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 5. 插入示例 fee_entries
-- ==========================================
INSERT INTO fee_entries (
  provider_id,
  submitter_user_id,
  submitter_pseudo_id,
  property_type,
  management_fee_pct,
  management_fee_incl_gst,
  letting_fee_weeks,
  hidden_items,
  quote_transparency_score,
  initial_quote_total,
  final_total_paid,
  evidence_tier,
  visibility
) VALUES
-- Ray White Sydney CBD - 正常条目
('00000000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'apartment', 8.5, true, 1.0, '["annual_report_fee"]'::jsonb, 4, 1000.00, 1080.00, 'B', 'public'),

-- Ray White Sydney CBD - 高费用条目
('00000000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'apartment', 9.0, true, 1.5, '["card_surcharge", "admin_fee"]'::jsonb, 3, 1200.00, 1350.00, 'B', 'public'),

-- LJ Hooker Bondi - 透明度高
('00000000-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'house', 7.0, true, 1.0, '["maintenance_markup"]'::jsonb, 5, 1500.00, 1550.00, 'B', 'public'),

-- Raine & Horne Melbourne - 多隐藏费用
('00000000-0000-0000-0000-000000000103', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'apartment', 10.0, true, 2.0, '["annual_report_fee", "inspection_report_fee", "late_payment_fee"]'::jsonb, 
 2, 800.00, 950.00, 'C', 'public'),

-- McGrath Estate Agents - 低透明度
('00000000-0000-0000-0000-000000000104', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'apartment', 8.0, true, 1.0, '["card_surcharge"]'::jsonb, 2, 900.00, 1050.00, 'C', 'public'),

-- Belle Property Paddington
('00000000-0000-0000-0000-000000000106', '11111111-1111-1111-1111-111111111111', 'user_11111111', 
 'apartment', 7.5, true, 1.0, '["annual_report_fee"]'::jsonb, 4, 950.00, 1020.00, 'B', 'public')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 6. 验证数据（显示统计）
-- ==========================================
DO $$
DECLARE
  v_users_count INT;
  v_providers_approved INT;
  v_providers_pending INT;
  v_entries_count INT;
BEGIN
  SELECT COUNT(*) INTO v_users_count FROM auth.users WHERE email LIKE '%feelens.local';
  SELECT COUNT(*) INTO v_providers_approved FROM providers WHERE status = 'approved';
  SELECT COUNT(*) INTO v_providers_pending FROM providers WHERE status = 'pending';
  SELECT COUNT(*) INTO v_entries_count FROM fee_entries WHERE visibility = 'public';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Seed 数据加载完成！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '测试用户: % 个', v_users_count;
  RAISE NOTICE '  - test@feelens.local (普通用户)';
  RAISE NOTICE '  - admin@feelens.local (管理员)';
  RAISE NOTICE 'Approved Providers: % 个', v_providers_approved;
  RAISE NOTICE 'Pending Providers: % 个', v_providers_pending;
  RAISE NOTICE 'Public Entries: % 条', v_entries_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '登录凭据:';
  RAISE NOTICE '  测试用户: test@feelens.local / testpass123';
  RAISE NOTICE '  管理员:   admin@feelens.local / adminpass123';
  RAISE NOTICE '';
END $$;
