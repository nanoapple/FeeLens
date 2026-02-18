-- ==========================================
-- Phase 1 — Task 1.1: fee_entries 行业扩展列
--
-- 目的：让 fee_entries 具备多行业能力，同时零破坏现有房地产功能。
-- 所有新列都有 DEFAULT，现有行自动获得合理值。
--
-- 新增列：
--   industry_key  — 行业标识（默认 real_estate）
--   service_key   — 行业内服务子类（如 conveyancing）
--   fee_breakdown — 结构化费用明细（JSONB）
--   context       — 业务上下文（JSONB）
--
-- 安全性：
--   本 migration 只做 ALTER TABLE ADD COLUMN，不改现有列/约束/RPC。
--   完全幂等（IF NOT EXISTS）。
-- ==========================================

-- 行业标识：real_estate | legal_services | ...（未来扩展）
ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS industry_key TEXT NOT NULL DEFAULT 'real_estate';

-- 行业内服务子类（如 property_management, conveyancing, family_law）
-- 允许 NULL：房地产 MVP 阶段可不填（向后兼容）
ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS service_key TEXT;

-- 结构化费用明细（统一事实层核心）
-- 各行业的具体费用字段全部收进这个 JSONB
ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 业务上下文（行业相关的非费用信息）
-- 如 property_type, matter_type, jurisdiction 等
ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ==========================================
-- 回填说明（本 migration 不做 backfill）：
--
-- 现有房地产数据的 industry_key 已通过 DEFAULT 设为 'real_estate'。
-- fee_breakdown/context 的回填（从旧列迁移数据）将在 Phase 2 的
-- 独立 migration 或一次性脚本中完成。
--
-- Dev 环境：seed.sql 将直接写入新结构，无需 backfill。
-- Prod 环境：Phase 2 提供幂等回填脚本。
-- ==========================================
