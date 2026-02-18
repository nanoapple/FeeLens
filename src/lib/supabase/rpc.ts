/**
 * FeeLens — RPC + Storage helpers
 *
 * Policy:
 * - RPC is allowed only for internal verification / linking steps that Edge cannot do cleanly from the client.
 * - Storage signed upload is performed here.
 */

import { createClient } from './client.browser'
import {
  ConfirmUploadResponse,
  LinkEvidenceParams,
  LinkEvidenceResponse,
  RequestUploadUrlResponse,
} from './types'
import { requestUploadUrl } from './edge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRpc = any

function callRpc(
  supabase: ReturnType<typeof createClient>,
  fnName: string,
  params: Record<string, unknown>
) {
  return (supabase.rpc as AnyRpc)(fnName, params) as Promise<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
}

/**
 * 使用 Supabase SDK 的 uploadToSignedUrl 上传文件
 * 比裸 fetch PUT 更可靠：自动处理 token、headers、content-type
 */
export async function uploadFileWithToken(
  objectKey: string,
  token: string,
  file: File | Blob
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const { error } = await supabase.storage
      .from('evidence')
      .uploadToSignedUrl(objectKey, token, file)

    if (error) {
      console.error('上传失败:', error)
      return { success: false, error: error.message || '上传失败' }
    }

    return { success: true }
  } catch (e) {
    console.error('上传时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

/**
 * RPC: confirm_evidence_upload
 * - verifies object exists and belongs to the evidence record
 */
export async function confirmEvidenceUpload(
  evidenceId: string
): Promise<ConfirmUploadResponse> {
  const supabase = createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: '请先登录' }
    }

    const { data, error } = await callRpc(
      supabase,
      'confirm_evidence_upload',
      { p_evidence_id: evidenceId }
    )

    if (error) {
      return { success: false, error: error.message || '确认上传失败' }
    }

    const success = Boolean(data?.success)
    return success ? { success: true } : { success: false, error: (data?.error as string) || '确认上传失败' }
  } catch (e) {
    console.error('确认上传时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

/**
 * RPC: link_evidence_to_entry
 * - links evidence record to an entry (and may set evidence tier)
 */
export async function linkEvidenceToEntry(
  params: LinkEvidenceParams
): Promise<LinkEvidenceResponse> {
  const supabase = createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: '请先登录' }
    }

    const { data, error } = await callRpc(
      supabase,
      'link_evidence_to_entry',
      { p_evidence_id: params.evidence_id, p_entry_id: params.entry_id }
    )

    if (error) {
      return { success: false, error: error.message || '关联证据失败' }
    }

    const success = Boolean(data?.success)
    return success
      ? { success: true, object_key: data?.object_key as string | undefined }
      : { success: false, error: (data?.error as string) || '关联证据失败' }
  } catch (e) {
    console.error('关联证据时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 一站式 evidence 上传（签名 → 上传 → confirm → 可选 link）
 * - if entryId is provided, link will be executed.
 */
export async function uploadEvidence(opts: {
  file: File
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  entryId?: string
}): Promise<{
  success: boolean
  evidence_id?: string
  object_key?: string
  error?: string
}> {
  try {
    const sign = await requestUploadUrl({
      mime_type: opts.mimeType,
      file_size_bytes: opts.file.size,
      entry_id: opts.entryId,
    })

    if (!sign.success || !sign.object_key || !sign.token || !sign.evidence_id) {
      return { success: false, error: sign.error || '获取上传链接失败' }
    }

    const upload = await uploadFileWithToken(sign.object_key, sign.token, opts.file)
    if (!upload.success) {
      return { success: false, error: upload.error || '上传失败' }
    }

    const confirm = await confirmEvidenceUpload(sign.evidence_id)
    if (!confirm.success) {
      return { success: false, error: confirm.error || '确认上传失败' }
    }

    if (opts.entryId) {
      const linked = await linkEvidenceToEntry({ evidence_id: sign.evidence_id, entry_id: opts.entryId })
      if (!linked.success) {
        return { success: false, error: linked.error || '关联证据失败' }
      }
    }

    return { success: true, evidence_id: sign.evidence_id, object_key: sign.object_key }
  } catch (e) {
    console.error('上传证据流程异常:', e)
    return { success: false, error: '网络错误' }
  }
}
