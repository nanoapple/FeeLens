-- ==========================================
-- Phase 1 — Task 1.2: industry_schemas 配置表
--
-- 目的：行业 schema 注册中心。新增行业只需 INSERT 一条配置，
--       不需要 ALTER TABLE 或改代码。
--
-- 设计决策（来自高层对齐）：
--   - fee_breakdown_schema 存 JSON Schema 格式（Edge Function 做完整校验）
--   - RPC 层只读取 allowed_keys 做白名单兜底
--   - context_schema 允许 additionalProperties:true（MVP 阶段不严格限制）
--   - validation_rules 存行业补充规则（Phase 3 开始配置化）
--   - version 字段用于 schema 演进追踪
--
-- RLS：
--   所有人可读（前端需要读 schema 渲染表单）
--   只有 admin 能写（通过 RPC/migration，不开放客户端写入）
-- ==========================================

CREATE TABLE IF NOT EXISTS industry_schemas (
  -- 主键：行业标识，与 fee_entries.industry_key 对应
  industry_key TEXT PRIMARY KEY,

  -- 显示名称
  display_name TEXT NOT NULL,

  -- 服务分类（如 matter_types、service_categories）
  service_taxonomy JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 费用明细的 JSON Schema（驱动前端表单 + Edge Function 校验）
  fee_breakdown_schema JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 上下文的 JSON Schema（驱动前端表单 + Edge Function 校验）
  context_schema JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 行业补充校验规则（条件必填、范围检查、透明度信号）
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Schema 版本（ON CONFLICT 时自动 bump）
  version INT NOT NULL DEFAULT 1,

  -- 是否启用（软删除/临时下线）
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- RLS
-- ==========================================
ALTER TABLE industry_schemas ENABLE ROW LEVEL SECURITY;

-- 所有已认证用户可读（前端需要 schema 渲染表单）
CREATE POLICY "anyone_can_read_schemas"
ON industry_schemas FOR SELECT
USING (true);

-- 不允许客户端直接写入（schema 变更只走 migration 或 admin RPC）
-- 不创建 INSERT/UPDATE/DELETE policy = 默认拒绝

-- 表级 SELECT 权限
GRANT SELECT ON industry_schemas TO authenticated;
GRANT SELECT ON industry_schemas TO anon;

-- ==========================================
-- 插入 real_estate schema（现有行业的配置记录）
--
-- MVP 阶段：房地产的 fee_breakdown_schema 暂时留空，
-- 因为房地产仍走旧列路径。Phase 2 backfill 完成后再补充。
-- ==========================================
INSERT INTO industry_schemas (
  industry_key,
  display_name,
  service_taxonomy,
  fee_breakdown_schema,
  context_schema,
  validation_rules,
  version,
  is_active
) VALUES (
  'real_estate',
  'Real Estate / Property Management',
  '{
    "service_types": ["property_management"]
  }'::jsonb,
  '{"_note": "Phase 2: will be populated after backfill validation"}'::jsonb,
  '{"_note": "Phase 2: will be populated after backfill validation"}'::jsonb,
  '{
    "rules": [
      {
        "id": "management_fee_range_flag",
        "description": "Flag entries with extreme management fee percentages",
        "logic": {
          "range_checks": {
            "fee_breakdown.management_fee_pct": {"flag_below": 4, "flag_above": 15}
          }
        }
      }
    ]
  }'::jsonb,
  1,
  true
)
ON CONFLICT (industry_key) DO NOTHING;
-- 注意：用 DO NOTHING 而非 DO UPDATE，因为如果已存在说明之前已配置过，
-- 不应覆盖可能的人工修改。schema 更新应走专门的版本化流程。
