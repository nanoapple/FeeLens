-- ==========================================
-- Phase 4-A1: dev.set_auth() — 本地测试认证注入
--
-- 解决 Studio SQL Editor / psql 中 auth.uid() 为 NULL 的问题。
-- 仅在本地开发环境可用。
--
-- 用法：
--   SELECT dev.set_auth('11111111-1111-1111-1111-111111111111');
--   SELECT auth.uid();  -- 现在返回测试用户 UUID
--   SELECT public.create_fee_entry_v2(...);  -- 正常工作
--
-- 清除：
--   SELECT dev.clear_auth();
-- ==========================================

-- 创建 dev schema（如果不存在）
CREATE SCHEMA IF NOT EXISTS dev;

-- ==========================================
-- dev.set_auth(uid) — 注入认证上下文
-- ==========================================
CREATE OR REPLACE FUNCTION dev.set_auth(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 设置完整 JWT claims JSON（Supabase auth.uid()/auth.role() 的主要读取源）
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true  -- 仅当前事务
  );

  -- 同时设置拆分 claim（PostgREST 某些版本从这里读取）
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 验证并返回
  RETURN auth.uid();
END;
$$;

-- ==========================================
-- dev.clear_auth() — 清除认证上下文
-- ==========================================
CREATE OR REPLACE FUNCTION dev.clear_auth()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

-- ==========================================
-- dev.quick_test_v2() — 一键测试 create_fee_entry_v2
-- 以 test@feelens.local 身份创建一条法律服务条目
-- ==========================================
CREATE OR REPLACE FUNCTION dev.quick_test_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, dev
AS $$
DECLARE
  v_test_user UUID := '11111111-1111-1111-1111-111111111111';
  v_provider UUID;
  v_result jsonb;
BEGIN
  -- 注入 auth
  PERFORM dev.set_auth(v_test_user);

  -- 找一个 legal approved provider
  SELECT id INTO v_provider
  FROM public.providers
  WHERE status = 'approved'
    AND 'legal_services' = ANY(industry_tags)
  LIMIT 1;

  IF v_provider IS NULL THEN
    RETURN jsonb_build_object('error', 'No approved legal provider found in seed data');
  END IF;

  -- 调用 v2
  SELECT public.create_fee_entry_v2(
    p_provider_id := v_provider,
    p_industry_key := 'legal_services',
    p_service_key := 'conveyancing',
    p_fee_breakdown := '{
      "pricing_model": "fixed",
      "fixed_fee_amount": 1800,
      "gst_included": true,
      "disbursements_items": [
        {"label": "Title search", "amount": 30, "is_estimate": false}
      ],
      "total_estimated": 1830
    }'::jsonb,
    p_context := '{
      "matter_type": "conveyancing",
      "jurisdiction": "NSW",
      "client_type": "individual",
      "complexity_band": "low",
      "property_value": 650000,
      "transaction_side": "buyer",
      "property_type": "unit"
    }'::jsonb
  ) INTO v_result;

  -- 清除 auth
  PERFORM dev.clear_auth();

  RETURN v_result;
END;
$$;

-- GRANT（本地所有角色都能用）
GRANT USAGE ON SCHEMA dev TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO authenticated, anon, service_role;
