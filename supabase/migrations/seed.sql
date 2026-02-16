-- ==========================================
-- Feelens MVP - 测试数据
-- ==========================================

-- ==========================================
-- 1. 创建测试管理员用户（手动在 Supabase Auth 创建后关联）
-- ==========================================
-- 注意：先在 Supabase Dashboard 创建用户，获取 UUID 后替换下面的 ID

-- 示例：假设管理员用户 ID 为以下值（替换为真实 UUID）
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000001';  -- 替换为真实 UUID
BEGIN
  -- 添加管理员角色
  INSERT INTO user_roles (user_id, role) 
  VALUES (v_admin_id, 'admin')
  ON CONFLICT DO NOTHING;
END $$;

-- ==========================================
-- 2. 插入测试 providers（已审核通过）
-- ==========================================
INSERT INTO providers (name, slug, state, postcode, suburb, geo_lat, geo_lng, canonical_website, abn, status) VALUES
('Ray White Sydney CBD', 'ray-white-sydney-cbd', 'NSW', '2000', 'Sydney', -33.8688, 151.2093, 'raywhite.com', '12345678901', 'approved'),
('LJ Hooker Bondi', 'lj-hooker-bondi', 'NSW', '2026', 'Bondi', -33.8908, 151.2743, 'ljhooker.com.au', '23456789012', 'approved'),
('Raine & Horne Melbourne', 'raine-horne-melbourne', 'VIC', '3000', 'Melbourne', -37.8136, 144.9631, 'rainehorne.com.au', '34567890123', 'approved'),
('McGrath Estate Agents', 'mcgrath-estate-agents', 'NSW', '2060', 'North Sydney', -33.8382, 151.2070, 'mcgrath.com.au', '45678901234', 'approved'),
('First National Real Estate', 'first-national-real-estate', 'QLD', '4000', 'Brisbane', -27.4698, 153.0251, 'firstnational.com.au', '56789012345', 'approved')
ON CONFLICT (slug) DO NOTHING;

-- ==========================================
-- 3. 插入测试 providers（待审核）
-- ==========================================
INSERT INTO providers (name, slug, state, postcode, suburb, status) VALUES
('Test Property Management', 'test-property-management', 'NSW', '2000', 'Sydney', 'pending'),
('Sample Realty Group', 'sample-realty-group', 'VIC', '3000', 'Melbourne', 'pending')
ON CONFLICT (slug) DO NOTHING;

-- ==========================================
-- 4. 插入测试 fee_entries（模拟用户提交）
-- ==========================================
-- 注意：submitter_user_id 需要替换为真实用户 UUID

DO $$
DECLARE
  v_provider_id UUID;
  v_test_user_id UUID := '00000000-0000-0000-0000-000000000002';  -- 替换为测试用户 UUID
BEGIN
  -- 获取第一个 provider 的 ID
  SELECT id INTO v_provider_id FROM providers WHERE slug = 'ray-white-sydney-cbd';
  
  IF v_provider_id IS NOT NULL THEN
    -- 插入测试 entry（使用 RPC，模拟真实提交）
    PERFORM submit_fee_entry(
      p_user_id := v_test_user_id,
      p_provider_id := v_provider_id,
      p_property_type := 'apartment',
      p_management_fee_pct := 8.5,
      p_management_fee_incl_gst := true,
      p_letting_fee_weeks := 1.0,
      p_hidden_items := '["annual_report_fee", "card_surcharge"]'::jsonb,
      p_quote_transparency_score := 3,
      p_initial_quote_total := 1000.00,
      p_final_total_paid := 1150.00
    );
  END IF;
END $$;

-- ==========================================
-- 5. 常用查询（测试用）
-- ==========================================

-- 查看所有已审核的 providers
-- SELECT * FROM providers WHERE status = 'approved';

-- 查看所有 public 的 fee_entries
-- SELECT * FROM fee_entries WHERE visibility = 'public';

-- 查看审计日志
-- SELECT * FROM moderation_actions ORDER BY created_at DESC LIMIT 10;
