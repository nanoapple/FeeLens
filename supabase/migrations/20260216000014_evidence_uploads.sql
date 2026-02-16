-- ==========================================
-- FeeLens: Evidence Upload 专家审查修复
--
-- 修复项：
--   P0-1: link_evidence_to_entry 只允许 uploaded + 检查过期
--   P0-2: confirm_evidence_upload 校验 storage.objects 存在
--   P0-3: 移除 create_evidence_upload 中对 moderation_actions 的耦合
--   P0-4: 显式 GRANT EXECUTE 给 authenticated
--   P1-1: object_key 路径去掉冗余 evidence/ 前缀
--   P1-2: 所有 SECURITY DEFINER 函数加 SET search_path
--
-- 额外修复：
--   清理 000010 留下的旧签名 RPC 重载（4 参数版本）
-- ==========================================

-- ==========================================
-- 0. 清理旧的 RPC 重载
--    migration 000010 创建了带 p_user_id/p_admin_id 的版本，
--    migration 000013 用 CREATE OR REPLACE 创建了新签名版本，
--    但 PG 把不同参数签名视为不同函数 → 产生了重载。
--    必须显式 DROP 旧签名。
-- ==========================================

-- report_entry: 旧版 (UUID, UUID, VARCHAR, TEXT)，新版 (UUID, VARCHAR, TEXT)
DROP FUNCTION IF EXISTS report_entry(UUID, UUID, VARCHAR, TEXT);

-- moderate_entry: 旧版 (UUID, UUID, VARCHAR, TEXT)，新版 (UUID, VARCHAR, TEXT)
DROP FUNCTION IF EXISTS moderate_entry(UUID, UUID, VARCHAR, TEXT);

-- approve_provider: 旧版 (UUID, UUID, VARCHAR, TEXT)，新版 (UUID, VARCHAR, TEXT)
DROP FUNCTION IF EXISTS approve_provider(UUID, UUID, VARCHAR, TEXT);

-- resolve_dispute: 旧版 (UUID, UUID, VARCHAR, TEXT, TEXT)，新版 (UUID, VARCHAR, TEXT, TEXT)
DROP FUNCTION IF EXISTS resolve_dispute(UUID, UUID, VARCHAR, TEXT, TEXT);

-- ==========================================
-- 1. create_evidence_upload（重写）
--    修复：移除审计耦合 + 路径去冗余 + SET search_path
-- ==========================================
CREATE OR REPLACE FUNCTION create_evidence_upload(
  p_mime_type VARCHAR,
  p_file_size_bytes BIGINT,
  p_entry_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth
AS $$
DECLARE
  v_user_id UUID;
  v_evidence_id UUID;
  v_object_key TEXT;
  v_daily_count INT;
  v_max_size BIGINT := 10485760;  -- 10 MB
  v_allowed_mimes TEXT[] := ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf'
  ];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized: not authenticated');
  END IF;

  -- MIME 白名单
  IF NOT (p_mime_type = ANY(v_allowed_mimes)) THEN
    RETURN jsonb_build_object(
      'error', 'Unsupported file type',
      'allowed', to_jsonb(v_allowed_mimes)
    );
  END IF;

  -- 大小校验
  IF p_file_size_bytes <= 0 OR p_file_size_bytes > v_max_size THEN
    RETURN jsonb_build_object(
      'error', format('File size must be between 1 byte and %s bytes', v_max_size)
    );
  END IF;

  -- entry 归属校验
  IF p_entry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM fee_entries
      WHERE id = p_entry_id AND submitter_user_id = v_user_id
    ) THEN
      RETURN jsonb_build_object('error', 'Entry not found or not owned by you');
    END IF;
  END IF;

  -- 每日限流
  SELECT COUNT(*) INTO v_daily_count
  FROM evidence_uploads
  WHERE user_id = v_user_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF v_daily_count >= 10 THEN
    RETURN jsonb_build_object('error', 'Daily upload limit reached (10/day)');
  END IF;

  -- 生成 object_key: {user_prefix}/{uuid}.{ext}
  v_evidence_id := gen_random_uuid();
  v_object_key :=
    substring(v_user_id::text, 1, 8) || '/' ||
    v_evidence_id::text || '.' ||
    CASE p_mime_type
      WHEN 'image/jpeg' THEN 'jpg'
      WHEN 'image/png'  THEN 'png'
      WHEN 'image/webp' THEN 'webp'
      WHEN 'application/pdf' THEN 'pdf'
      ELSE 'bin'
    END;

  -- 插入登记记录
  INSERT INTO evidence_uploads (
    id, user_id, entry_id, object_key,
    mime_type, file_size_bytes, status
  ) VALUES (
    v_evidence_id, v_user_id, p_entry_id, v_object_key,
    p_mime_type, p_file_size_bytes, 'pending'
  );

  RETURN jsonb_build_object(
    'success', true,
    'evidence_id', v_evidence_id,
    'object_key', v_object_key
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 2. confirm_evidence_upload（重写）
--    修复：校验 storage.objects 中文件确实存在
-- ==========================================
CREATE OR REPLACE FUNCTION confirm_evidence_upload(
  p_evidence_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth
AS $$
DECLARE
  v_user_id UUID;
  v_status VARCHAR(20);
  v_object_key TEXT;
  v_expires_at TIMESTAMP;
  v_file_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT status, object_key, expires_at
  INTO v_status, v_object_key, v_expires_at
  FROM evidence_uploads
  WHERE id = p_evidence_id AND user_id = v_user_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Evidence record not found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('error', format('Cannot confirm: current status is %s', v_status));
  END IF;

  IF v_expires_at < NOW() THEN
    UPDATE evidence_uploads SET status = 'expired' WHERE id = p_evidence_id;
    RETURN jsonb_build_object('error', 'Upload URL has expired');
  END IF;

  -- 核验 Storage 中文件确实存在
  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'evidence' AND name = v_object_key
  ) INTO v_file_exists;

  IF NOT v_file_exists THEN
    RETURN jsonb_build_object('error', 'File not found in storage. Upload the file first.');
  END IF;

  UPDATE evidence_uploads
  SET status = 'uploaded', uploaded_at = NOW()
  WHERE id = p_evidence_id AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 3. link_evidence_to_entry（重写）
--    修复：只允许 uploaded 状态 + 检查过期
-- ==========================================
CREATE OR REPLACE FUNCTION link_evidence_to_entry(
  p_evidence_id UUID,
  p_entry_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth
AS $$
DECLARE
  v_user_id UUID;
  v_evidence_status VARCHAR(20);
  v_object_key TEXT;
  v_expires_at TIMESTAMP;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT status, object_key, expires_at
  INTO v_evidence_status, v_object_key, v_expires_at
  FROM evidence_uploads
  WHERE id = p_evidence_id AND user_id = v_user_id;

  IF v_evidence_status IS NULL THEN
    RETURN jsonb_build_object('error', 'Evidence record not found');
  END IF;

  IF v_evidence_status != 'uploaded' THEN
    RETURN jsonb_build_object(
      'error', format('Cannot link: evidence status must be "uploaded", got "%s"', v_evidence_status)
    );
  END IF;

  IF v_expires_at < NOW() THEN
    UPDATE evidence_uploads SET status = 'expired' WHERE id = p_evidence_id;
    RETURN jsonb_build_object('error', 'Evidence upload has expired');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fee_entries
    WHERE id = p_entry_id AND submitter_user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Entry not found or not owned by you');
  END IF;

  UPDATE evidence_uploads
  SET entry_id = p_entry_id, status = 'linked'
  WHERE id = p_evidence_id;

  UPDATE fee_entries
  SET evidence_object_key = v_object_key,
      evidence_tier = 'A',
      updated_at = NOW()
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true, 'object_key', v_object_key);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==========================================
-- 4. GRANT EXECUTE（完整参数签名，避免歧义）
-- ==========================================

-- Evidence RPC
GRANT EXECUTE ON FUNCTION create_evidence_upload(VARCHAR, BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_evidence_upload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION link_evidence_to_entry(UUID, UUID) TO authenticated;

-- 原有 RPC
GRANT EXECUTE ON FUNCTION submit_fee_entry(UUID, VARCHAR, DECIMAL, BOOLEAN, DECIMAL, DECIMAL, DECIMAL, DECIMAL, JSONB, INT, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION report_entry(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION moderate_entry(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_provider(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_dispute(UUID, VARCHAR, TEXT, TEXT) TO authenticated;

-- ==========================================
-- 5. 修复 Storage RLS 策略
-- ==========================================

DROP POLICY IF EXISTS "users_read_own_evidence_files" ON storage.objects;
DROP POLICY IF EXISTS "admins_read_all_evidence_files" ON storage.objects;
DROP POLICY IF EXISTS "users_upload_own_evidence" ON storage.objects;

CREATE POLICY "users_read_own_evidence_files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evidence'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = substring(auth.uid()::text, 1, 8)
);

CREATE POLICY "admins_read_all_evidence_files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evidence'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
);

CREATE POLICY "users_upload_own_evidence"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'evidence'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = substring(auth.uid()::text, 1, 8)
);

-- ==========================================
-- 6. SET search_path 补到旧 RPC（完整签名）
-- ==========================================

ALTER FUNCTION submit_fee_entry(UUID, VARCHAR, DECIMAL, BOOLEAN, DECIMAL, DECIMAL, DECIMAL, DECIMAL, JSONB, INT, DECIMAL, DECIMAL) SET search_path = public, auth;
ALTER FUNCTION report_entry(UUID, VARCHAR, TEXT) SET search_path = public, auth;
ALTER FUNCTION moderate_entry(UUID, VARCHAR, TEXT) SET search_path = public, auth;
ALTER FUNCTION approve_provider(UUID, VARCHAR, TEXT) SET search_path = public, auth;
ALTER FUNCTION resolve_dispute(UUID, VARCHAR, TEXT, TEXT) SET search_path = public, auth;