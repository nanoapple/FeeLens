 -- ==========================================
-- Feelens MVP - 初始数据库结构
-- ==========================================

-- 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 用于文本搜索

-- ==========================================
-- 1. providers 表（商家/服务提供商）
-- ==========================================
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'property_management',
  
  -- 地理信息（结构化）
  state VARCHAR(10),  -- NSW/VIC/QLD/SA/WA/TAS/NT/ACT
  postcode VARCHAR(10),
  suburb VARCHAR(100),
  address_text TEXT,
  geo_lat DECIMAL(10, 8),
  geo_lng DECIMAL(11, 8),
  
  -- 核验与去重
  canonical_website VARCHAR(255),
  abn VARCHAR(20),
  
  -- 审核状态（关键）
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- 元数据
  source VARCHAR(50) NOT NULL DEFAULT 'user_created',
  evidence_coverage_pct DECIMAL(5,2) DEFAULT 0.00,
  review_count INT DEFAULT 0,
  
  -- 时间戳
  is_disputed BOOLEAN DEFAULT false,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_providers_state_postcode ON providers(state, postcode);
CREATE INDEX idx_providers_suburb ON providers(suburb);
CREATE INDEX idx_providers_status ON providers(status) WHERE status = 'approved';
CREATE INDEX idx_providers_geo ON providers(geo_lat, geo_lng) WHERE geo_lat IS NOT NULL;
CREATE INDEX idx_providers_abn ON providers(abn) WHERE abn IS NOT NULL;
CREATE UNIQUE INDEX uniq_provider_domain ON providers(canonical_website) WHERE canonical_website IS NOT NULL;

-- 全文搜索索引
CREATE INDEX idx_providers_name_trgm ON providers USING gin(name gin_trgm_ops);

-- ==========================================
-- 2. fee_entries 表（费用条目）
-- ==========================================
CREATE TABLE fee_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  
  -- 用户身份（双 ID 策略）
  submitter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_pseudo_id VARCHAR(64),
  submitter_ip_hash VARCHAR(64),  -- 30天后自动清除
  
  -- 风控
  risk_flags JSONB DEFAULT '[]'::jsonb,
  
  -- 结构化字段
  property_type VARCHAR(50),
  contract_start_date DATE,
  
  management_fee_pct DECIMAL(5,2),
  management_fee_incl_gst BOOLEAN DEFAULT true,
  letting_fee_weeks DECIMAL(3,2),
  inspection_fee_fixed DECIMAL(10,2),
  repair_margin_pct DECIMAL(5,2),
  break_fee_amount DECIMAL(10,2),
  
  hidden_items JSONB DEFAULT '[]'::jsonb,
  quote_transparency_score INT CHECK (quote_transparency_score BETWEEN 1 AND 5),
  
  -- 费用差异（拆分字段）
  initial_quote_total DECIMAL(10,2),
  final_total_paid DECIMAL(10,2),
  delta_pct DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN initial_quote_total > 0 AND final_total_paid IS NOT NULL
      THEN ROUND(((final_total_paid - initial_quote_total) / initial_quote_total * 100)::numeric, 2)
      ELSE NULL 
    END
  ) STORED,
  
  -- 证据
  evidence_tier VARCHAR(1) NOT NULL CHECK (evidence_tier IN ('A','B','C')),
  evidence_object_key TEXT,
  
  -- 时效
  submit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE GENERATED ALWAYS AS ((submit_date + INTERVAL '12 months')::date) STORED,
  
  -- 状态
  dispute_status VARCHAR(20) DEFAULT 'none' CHECK (dispute_status IN ('none','pending','resolved')),
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public','hidden','flagged')),
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_fee_entries_provider ON fee_entries(provider_id);
CREATE INDEX idx_fee_entries_user ON fee_entries(submitter_user_id);
CREATE INDEX idx_fee_entries_pseudo_id ON fee_entries(submitter_pseudo_id);
CREATE INDEX idx_fee_entries_tier ON fee_entries(evidence_tier);
CREATE INDEX idx_fee_entries_visibility ON fee_entries(visibility, submit_date DESC) WHERE visibility = 'public';
CREATE INDEX idx_fee_entries_expiry ON fee_entries(expiry_date);
CREATE INDEX idx_fee_entries_created ON fee_entries(created_at DESC);

-- ==========================================
-- 3. fee_hidden_tags 表（标准化隐藏费用标签）
-- ==========================================
CREATE TABLE fee_hidden_tags (
  entry_id UUID NOT NULL REFERENCES fee_entries(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  PRIMARY KEY (entry_id, tag)
);

CREATE INDEX idx_tags_tag ON fee_hidden_tags(tag);
CREATE INDEX idx_tags_entry ON fee_hidden_tags(entry_id);

-- ==========================================
-- 4. moderation_actions 表（审计日志）
-- ==========================================
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES fee_entries(id) ON DELETE CASCADE,
  
  -- 操作者（拆分字段）
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('system','admin','provider','user')),
  actor_id VARCHAR(100),
  
  -- 动作
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  
  -- 快照（审计）
  before_snapshot JSONB,
  after_snapshot JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_moderation_entry ON moderation_actions(entry_id, created_at DESC);
CREATE INDEX idx_moderation_actor ON moderation_actions(actor_type, actor_id);
CREATE INDEX idx_moderation_action ON moderation_actions(action, created_at DESC);

-- ==========================================
-- 5. disputes 表（争议处理）
-- ==========================================
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES fee_entries(id) ON DELETE CASCADE,
  
  -- 核验信息
  provider_verification_method VARCHAR(50),
  provider_contact VARCHAR(255),
  provider_claim TEXT NOT NULL,
  
  -- 平台处理
  platform_response TEXT,
  resolution_note TEXT,
  outcome VARCHAR(50) CHECK (outcome IN ('maintained','corrected','removed','partial_hidden')),
  
  -- 时间线
  opened_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected'))
);

CREATE INDEX idx_disputes_entry ON disputes(entry_id);
CREATE INDEX idx_disputes_status ON disputes(status, opened_at DESC);

-- ==========================================
-- 6. user_roles 表（用户角色）
-- ==========================================
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'moderator', 'admin')),
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ==========================================
-- 7. reports 表（用户举报，简化版）
-- ==========================================
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES fee_entries(id) ON DELETE CASCADE,
  reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('inaccurate', 'fake', 'expired', 'offensive')),
  details TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reports_entry ON reports(entry_id);
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

-- ==========================================
-- 启用 RLS（所有表，策略在下一个文件定义）
-- ==========================================
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_hidden_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

