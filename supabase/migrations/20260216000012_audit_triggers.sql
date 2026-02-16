-- ==========================================
-- Feelens MVP - 审计触发器
-- ==========================================

-- ==========================================
-- 1. updated_at 自动更新触发器
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fee_entries_updated_at
BEFORE UPDATE ON fee_entries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_providers_updated_at
BEFORE UPDATE ON providers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 2. hidden_tags 自动同步触发器
-- ==========================================
CREATE OR REPLACE FUNCTION sync_hidden_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- 删除旧 tags
  DELETE FROM fee_hidden_tags WHERE entry_id = NEW.id;
  
  -- 插入新 tags
  IF NEW.hidden_items IS NOT NULL AND jsonb_array_length(NEW.hidden_items) > 0 THEN
    INSERT INTO fee_hidden_tags (entry_id, tag)
    SELECT NEW.id, jsonb_array_elements_text(NEW.hidden_items);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_hidden_tags
AFTER INSERT OR UPDATE OF hidden_items ON fee_entries
FOR EACH ROW
EXECUTE FUNCTION sync_hidden_tags();

-- ==========================================
-- 3. canonical_website 标准化触发器
-- ==========================================
CREATE OR REPLACE FUNCTION standardize_canonical_website()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.canonical_website IS NOT NULL THEN
    -- 移除 scheme、path、query，转小写，移除 www.
    NEW.canonical_website := lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(NEW.canonical_website, '^https?://', ''),
          '/.*$', ''
        ),
        '^www\.', ''
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_standardize_website
BEFORE INSERT OR UPDATE ON providers
FOR EACH ROW
EXECUTE FUNCTION standardize_canonical_website();

-- ==========================================
-- 4. IP hash 定期清理（需配合外部 cron）
-- ==========================================
CREATE OR REPLACE FUNCTION cleanup_old_ip_hashes()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  UPDATE fee_entries
  SET submitter_ip_hash = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND submitter_ip_hash IS NOT NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注释：调用方式
-- SELECT cleanup_old_ip_hashes();
-- 或通过 pg_cron 扩展定时执行
 
