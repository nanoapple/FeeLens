-- ==========================================
-- Phase 3.1 — Task 3.1: 插入 legal_services schema
--
-- 这是 FeeLens 从"房地产工具"到"多行业平台"的关键一步。
-- 插入后，系统就具备了法律服务的 schema 定义能力。
--
-- 包含：
--   - service_taxonomy：四类 matter_type
--   - fee_breakdown_schema：JSON Schema 格式（驱动前端表单 + Edge 校验）
--   - context_schema：JSON Schema 格式（通用 + 分支字段）
--   - validation_rules：MVP 版行业补充规则
--
-- 设计决策（高层对齐）：
--   - fee_breakdown: additionalProperties=false（防垃圾桶硬闸门）
--   - context: additionalProperties=true（MVP 阶段允许迭代）
--   - pricing_model + gst_included 为 required（最低必填）
--   - matter_type + jurisdiction 为 context required
--   - ON CONFLICT 自动 bump version（支持迭代发布）
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
  'legal_services',
  'Legal Services',

  -- ========== service_taxonomy ==========
  '{
    "matter_types": [
      "conveyancing",
      "workers_compensation",
      "family_law",
      "migration"
    ]
  }'::jsonb,

  -- ========== fee_breakdown_schema ==========
  -- JSON Schema draft-07 风格，additionalProperties=false
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "pricing_model": {
        "type": "string",
        "enum": ["fixed", "hourly", "blended", "retainer", "conditional"]
      },
      "fixed_fee_amount": {
        "type": "number",
        "minimum": 0
      },
      "hourly_rate": {
        "type": "number",
        "minimum": 0
      },
      "estimated_hours": {
        "type": "number",
        "minimum": 0
      },
      "retainer_amount": {
        "type": "number",
        "minimum": 0
      },
      "uplift_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "contingency_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "disbursements_total": {
        "type": "number",
        "minimum": 0
      },
      "disbursements_items": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "label": { "type": "string", "minLength": 1, "maxLength": 120 },
            "amount": { "type": "number", "minimum": 0 },
            "is_estimate": { "type": "boolean" }
          },
          "required": ["label", "amount"]
        }
      },
      "gst_included": {
        "type": "boolean"
      },
      "total_estimated": {
        "type": "number",
        "minimum": 0
      }
    },
    "required": ["pricing_model", "gst_included"]
  }'::jsonb,

  -- ========== context_schema ==========
  -- additionalProperties=true（MVP 阶段允许迭代加字段）
  '{
    "type": "object",
    "additionalProperties": true,
    "properties": {
      "matter_type": {
        "type": "string",
        "enum": ["conveyancing", "workers_compensation", "family_law", "migration"]
      },
      "jurisdiction": {
        "type": "string",
        "enum": ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]
      },
      "client_type": {
        "type": "string",
        "enum": ["individual", "business"]
      },
      "complexity_band": {
        "type": "string",
        "enum": ["low", "medium", "high"]
      },
      "urgency": {
        "type": "string",
        "enum": ["standard", "urgent"]
      },

      "property_value":    { "type": "number", "minimum": 0 },
      "transaction_side":  { "type": "string", "enum": ["buyer", "seller"] },
      "property_type":     { "type": "string", "enum": ["house", "unit", "land", "commercial", "other"] },

      "claim_stage":           { "type": "string" },
      "damages_claim":         { "type": "boolean" },
      "estimated_claim_value": { "type": "number", "minimum": 0 },

      "court_stage":        { "type": "string" },
      "children_involved":  { "type": "boolean" },

      "visa_type":          { "type": "string" },
      "application_stage":  { "type": "string" }
    },
    "required": ["matter_type", "jurisdiction"]
  }'::jsonb,

  -- ========== validation_rules ==========
  -- MVP 版：四类规则（条件必填、百分比披露、上下文推荐、透明度评分）
  '{
    "rules": [
      {
        "id": "pricing_model_required_fields",
        "description": "Enforce minimum fields by pricing model.",
        "logic": {
          "fixed":       ["fixed_fee_amount"],
          "hourly":      ["hourly_rate"],
          "blended":     ["hourly_rate", "estimated_hours"],
          "retainer":    ["retainer_amount"],
          "conditional": []
        }
      },
      {
        "id": "conditional_requires_pct_disclosure",
        "description": "If pricing_model is conditional, disclose either contingency_pct or uplift_pct.",
        "logic": {
          "when": { "fee_breakdown.pricing_model": "conditional" },
          "require_any": ["fee_breakdown.contingency_pct", "fee_breakdown.uplift_pct"]
        }
      },
      {
        "id": "matter_type_context_hints",
        "description": "Recommended context keys per matter_type (not mandatory in MVP).",
        "logic": {
          "conveyancing":         ["context.property_value", "context.transaction_side", "context.property_type"],
          "workers_compensation": ["context.claim_stage", "context.damages_claim"],
          "family_law":           ["context.court_stage", "context.children_involved"],
          "migration":            ["context.visa_type", "context.application_stage"]
        }
      },
      {
        "id": "transparency_scoring",
        "description": "Simple transparency scoring signals for MVP.",
        "logic": {
          "penalise_if_missing": [
            "fee_breakdown.pricing_model",
            "fee_breakdown.gst_included"
          ],
          "bonus_if_present": [
            "fee_breakdown.disbursements_items"
          ]
        }
      }
    ]
  }'::jsonb,

  1,    -- version
  true  -- is_active
)
ON CONFLICT (industry_key) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  service_taxonomy    = EXCLUDED.service_taxonomy,
  fee_breakdown_schema = EXCLUDED.fee_breakdown_schema,
  context_schema      = EXCLUDED.context_schema,
  validation_rules    = EXCLUDED.validation_rules,
  version             = industry_schemas.version + 1,
  is_active           = EXCLUDED.is_active,
  updated_at          = NOW();
-- ON CONFLICT + version bump：支持安全的 schema 迭代发布。
-- 每次重新运行此 migration 都会 bump version，便于追踪变更历史。
