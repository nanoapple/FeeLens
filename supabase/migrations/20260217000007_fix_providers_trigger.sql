-- ==========================================
-- 修复：providers 表的 updated_at 触发器
--
-- Bug：000012_audit_triggers.sql 给 providers 挂了
--      update_updated_at_column() 触发器，但 providers
--      表的时间戳列叫 last_updated，不叫 updated_at。
--      导致任何 UPDATE providers 都会报错：
--      "record 'new' has no field 'updated_at'"
--
-- 修复：替换为正确引用 last_updated 的触发器函数。
-- ==========================================

-- 1. 移除错误的触发器
DROP TRIGGER IF EXISTS trigger_providers_updated_at ON providers;

-- 2. 创建 providers 专用的时间戳更新函数
CREATE OR REPLACE FUNCTION update_providers_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 挂到 providers 表
CREATE TRIGGER trigger_providers_last_updated
BEFORE UPDATE ON providers
FOR EACH ROW
EXECUTE FUNCTION update_providers_last_updated();
