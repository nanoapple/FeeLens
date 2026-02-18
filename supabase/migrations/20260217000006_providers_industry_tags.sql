-- ==========================================
-- Phase 3: providers 行业标识（轻量升级）
--
-- 高层决策：选项 A — 加 industry_tags，不重写 providers 结构。
-- 法律服务 MVP 先把律所当 provider，不引入 practitioner 体系。
--
-- 新增列：
--   industry_tags text[] — 该 provider 服务的行业列表
--                          默认 ['real_estate']（现有 provider）
--   provider_type text   — business | individual
--                          默认 'business'（现有 provider 都是公司）
--
-- 安全性：
--   完全幂等（IF NOT EXISTS）
--   不修改现有列/约束/RPC
--   现有数据通过 DEFAULT 获得合理值
-- ==========================================

-- 行业标签（一个 provider 可以跨多个行业）
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS industry_tags TEXT[]
    NOT NULL DEFAULT ARRAY['real_estate'];

-- provider 类型（公司 vs 个人执业者）
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS provider_type TEXT
    NOT NULL DEFAULT 'business'
    CHECK (provider_type IN ('business', 'individual'));

-- 索引：按行业筛选 provider（GIN 支持 array 包含查询）
CREATE INDEX IF NOT EXISTS idx_providers_industry_tags
  ON providers USING gin(industry_tags);

-- 索引：按 provider_type 筛选
CREATE INDEX IF NOT EXISTS idx_providers_type
  ON providers(provider_type);

-- ==========================================
-- 回填说明：
-- 所有现有 provider 已通过 DEFAULT 获得：
--   industry_tags = ['real_estate']
--   provider_type = 'business'
--
-- 新增法律服务 provider 时应设置：
--   industry_tags = ['legal_services']（或多行业 provider 可以包含多个）
--   provider_type = 'business'（律所）或 'individual'（个人律师）
-- ==========================================
