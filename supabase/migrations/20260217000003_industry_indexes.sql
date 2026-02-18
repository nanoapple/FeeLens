-- ==========================================
-- Phase 1 — Task 1.3: 行业扩展索引
--
-- 三个索引：
--   1. btree 复合索引 — 行业+服务+时间，覆盖列表页主查询
--   2. GIN fee_breakdown — 支持 JSONB 内部键值查询
--   3. GIN context — 支持 JSONB 内部键值查询
--
-- 写入成本说明：
--   GIN 索引会增加 INSERT/UPDATE 开销。当前写入量极小（MVP 阶段），
--   而读场景（按行业筛选、按费用字段比较）是核心用户体验，值得做。
--   如果未来写入量暴增，可考虑延迟 GIN 索引为 BRIN 或去掉。
--
-- 幂等：全部使用 IF NOT EXISTS。
-- ==========================================

-- 1. 复合 btree：行业 + 服务子类 + 提交时间（降序）
--    覆盖场景：/legal/NSW/2000 列表页、按 service_key 筛选
CREATE INDEX IF NOT EXISTS idx_fee_entries_industry_service_date
  ON fee_entries(industry_key, service_key, submit_date DESC);

-- 2. GIN：fee_breakdown JSONB
--    覆盖场景：按 pricing_model 筛选、按费率范围查询、透明度评分计算
CREATE INDEX IF NOT EXISTS idx_fee_entries_fee_breakdown_gin
  ON fee_entries USING gin(fee_breakdown);

-- 3. GIN：context JSONB
--    覆盖场景：按 matter_type 筛选、按 jurisdiction 筛选
CREATE INDEX IF NOT EXISTS idx_fee_entries_context_gin
  ON fee_entries USING gin(context);
