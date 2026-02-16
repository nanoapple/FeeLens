// ==========================================
// Edge Functions 封装层
// 所有写入操作必须通过此文件的函数调用
// ==========================================

import { createClient } from './client'

// ==========================================
// 类型定义 — 原有业务
// ==========================================

export interface SubmitEntryParams {
  provider_id: string
  property_type: 'apartment' | 'house' | 'commercial'
  management_fee_pct: number
  management_fee_incl_gst: boolean
  letting_fee_weeks?: number
  inspection_fee_fixed?: number
  repair_margin_pct?: number
  break_fee_amount?: number
  hidden_items?: string[]
  quote_transparency_score?: number
  initial_quote_total?: number
  final_total_paid?: number
}

export interface SubmitEntryResponse {
  success: boolean
  entry_id?: string
  visibility?: 'public' | 'flagged' | 'hidden'
  requires_moderation?: boolean
  error?: string
}

export interface ReportEntryParams {
  entry_id: string
  reason: 'inaccurate' | 'fake' | 'expired' | 'offensive'
  details?: string
}

export interface ReportEntryResponse {
  success: boolean
  report_id?: string
  error?: string
}

export interface ModerateEntryParams {
  entry_id: string
  action: 'approve' | 'reject' | 'hide'
  reason?: string
}

export interface ModerateEntryResponse {
  success: boolean
  new_visibility?: string
  error?: string
}

export interface ApproveProviderParams {
  provider_id: string
  action: 'approve' | 'reject'
  reason?: string
}

export interface ApproveProviderResponse {
  success: boolean
  new_status?: string
  error?: string
}

export interface ResolveDisputeParams {
  dispute_id: string
  outcome: 'maintained' | 'corrected' | 'removed' | 'partial_hidden'
  platform_response: string
  resolution_note?: string
}

export interface ResolveDisputeResponse {
  success: boolean
  outcome?: string
  error?: string
}

// ==========================================
// 类型定义 — Evidence Upload
// ==========================================

export interface RequestUploadUrlParams {
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  file_size_bytes: number
  entry_id?: string
}

export interface RequestUploadUrlResponse {
  success: boolean
  evidence_id?: string
  object_key?: string
  signed_url?: string
  token?: string
  expires_in?: number
  error?: string
}

export interface ConfirmUploadResponse {
  success: boolean
  error?: string
}

export interface LinkEvidenceParams {
  evidence_id: string
  entry_id: string
}

export interface LinkEvidenceResponse {
  success: boolean
  object_key?: string
  error?: string
}

// ==========================================
// 内部辅助：类型安全的 RPC 调用
//
// Database.public.Functions 目前是空 stub（Record<string, unknown>），
// 导致 supabase.rpc('xxx', params) 把 params 推断为 undefined。
// 正式方案是用 supabase gen types 生成完整类型；
// 在生成之前，用这个 helper 绕过类型报错。
// ==========================================

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

// ==========================================
// Edge Function 调用封装 — 原有业务
// ==========================================

/**
 * 提交费用条目
 * 调用 Edge Function: submit-entry → RPC: submit_fee_entry
 */
export async function submitEntry(
  params: SubmitEntryParams
): Promise<SubmitEntryResponse> {
  const supabase = createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: '请先登录' }
    }

    const { data, error } = await supabase.functions.invoke<SubmitEntryResponse>(
      'submit-entry',
      { body: params }
    )

    if (error) {
      console.error('Edge Function 调用失败:', error)
      return { success: false, error: error.message || '提交失败，请稍后重试' }
    }

    return data as SubmitEntryResponse
  } catch (error) {
    console.error('提交条目时发生错误:', error)
    return { success: false, error: '网络错误，请检查连接后重试' }
  }
}

/**
 * 举报条目
 * 调用 Edge Function: report-entry
 */
export async function reportEntry(
  params: ReportEntryParams
): Promise<ReportEntryResponse> {
  const supabase = createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: '请先登录' }
    }

    const { data, error } = await supabase.functions.invoke<ReportEntryResponse>(
      'report-entry',
      { body: params }
    )

    if (error) {
      return { success: false, error: error.message || '举报失败' }
    }

    return data as ReportEntryResponse
  } catch (error) {
    console.error('举报时发生错误:', error)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 审核条目（管理员）
 * 调用 Edge Function: moderate-entry
 */
export async function moderateEntry(
  params: ModerateEntryParams
): Promise<ModerateEntryResponse> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.functions.invoke<ModerateEntryResponse>(
      'moderate-entry',
      { body: params }
    )

    if (error) {
      return { success: false, error: error.message || '审核失败' }
    }

    if (!data) {
      return { success: false, error: '审核失败' }
    }

    return data as ModerateEntryResponse
  } catch (error) {
    console.error('审核时发生错误:', error)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 审核商家（管理员）
 * 调用 Edge Function: approve-provider
 */
export async function approveProvider(
  params: ApproveProviderParams
): Promise<ApproveProviderResponse> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.functions.invoke<ApproveProviderResponse>(
      'approve-provider',
      { body: params }
    )

    if (error) {
      return { success: false, error: error.message || '审核失败' }
    }

    return data as ApproveProviderResponse
  } catch (error) {
    console.error('审核商家时发生错误:', error)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 解决争议（管理员）
 * 调用 Edge Function: resolve-dispute
 */
export async function resolveDispute(
  params: ResolveDisputeParams
): Promise<ResolveDisputeResponse> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.functions.invoke<ResolveDisputeResponse>(
      'resolve-dispute',
      { body: params }
    )

    if (error) {
      return { success: false, error: error.message || '争议处理失败' }
    }

    return data as ResolveDisputeResponse
  } catch (error) {
    console.error('处理争议时发生错误:', error)
    return { success: false, error: '网络错误' }
  }
}

// ==========================================
// Evidence Upload 函数
// ==========================================

/**
 * 请求证据上传签名 URL
 * 流程：Edge Function → RPC 登记 → 生成 signed URL → 返回
 */
export async function requestUploadUrl(
  params: RequestUploadUrlParams
): Promise<RequestUploadUrlResponse> {
  const supabase = createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: '请先登录' }
    }

    const { data, error } = await supabase.functions.invoke<RequestUploadUrlResponse>(
      'upload-sign',
      { body: params }
    )

    if (error) {
      return { success: false, error: error.message || '获取上传链接失败' }
    }

    return data as RequestUploadUrlResponse
  } catch (error) {
    console.error('请求上传签名时发生错误:', error)
    return { success: false, error: '网络错误' }
  }
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
      .uploadToSignedUrl(objectKey, token, file, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('SDK 上传失败:', error)
      return { success: false, error: error.message || '上传失败' }
    }

    return { success: true }
  } catch (error) {
    console.error('文件上传异常:', error)
    return { success: false, error: '上传失败，请检查网络连接' }
  }
}

/**
 * 确认证据上传完成
 * RPC 内部会校验 storage.objects 中文件是否真实存在
 */
export async function confirmEvidenceUpload(
  evidenceId: string
): Promise<ConfirmUploadResponse> {
  const supabase = createClient()

  try {
    const { data, error } = await callRpc(supabase, 'confirm_evidence_upload', {
      p_evidence_id: evidenceId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object' && 'error' in data) {
      return { success: false, error: data.error as string }
    }

    return { success: true }
  } catch (error) {
    console.error('确认上传失败:', error)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 将证据关联到 fee_entry
 * 前提：证据状态必须是 uploaded（已通过 confirm）
 */
export async function linkEvidenceToEntry(
  params: LinkEvidenceParams
): Promise<LinkEvidenceResponse> {
  const supabase = createClient()

  try {
    const { data, error } = await callRpc(supabase, 'link_evidence_to_entry', {
      p_evidence_id: params.evidence_id,
      p_entry_id: params.entry_id,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object' && 'error' in data) {
      return { success: false, error: data.error as string }
    }

    return (data ?? { success: true }) as unknown as LinkEvidenceResponse
  } catch (error) {
    console.error('关联证据失败:', error)
    return { success: false, error: '网络错误' }
  }
}

/**
 * 完整的证据上传流程（便捷封装）
 *
 * 1. requestUploadUrl  → RPC 登记 + 获取 signed URL
 * 2. uploadFileWithToken → SDK 上传到 Storage
 * 3. confirmEvidenceUpload → RPC 确认（校验 storage.objects）
 * 4. linkEvidenceToEntry → 关联到 entry（可选）
 */
export async function uploadEvidence(
  file: File,
  entryId?: string
): Promise<{
  success: boolean
  evidence_id?: string
  object_key?: string
  error?: string
}> {
  // 1. 请求签名
  const signResult = await requestUploadUrl({
    mime_type: file.type as RequestUploadUrlParams['mime_type'],
    file_size_bytes: file.size,
    entry_id: entryId,
  })

  if (!signResult.success || !signResult.object_key || !signResult.evidence_id || !signResult.token) {
    return { success: false, error: signResult.error || '获取上传链接失败' }
  }

  // 2. 使用 SDK 上传
  const uploadResult = await uploadFileWithToken(
    signResult.object_key,
    signResult.token,
    file
  )

  if (!uploadResult.success) {
    return { success: false, error: uploadResult.error }
  }

  // 3. 确认上传（RPC 会验证 storage.objects 中文件存在）
  const confirmResult = await confirmEvidenceUpload(signResult.evidence_id)

  if (!confirmResult.success) {
    return { success: false, error: confirmResult.error }
  }

  // 4. 如果指定了 entry_id，自动关联
  if (entryId) {
    const linkResult = await linkEvidenceToEntry({
      evidence_id: signResult.evidence_id,
      entry_id: entryId,
    })
    if (!linkResult.success) {
      console.warn('证据已上传但关联失败:', linkResult.error)
    }
  }

  return {
    success: true,
    evidence_id: signResult.evidence_id,
    object_key: signResult.object_key,
  }
}