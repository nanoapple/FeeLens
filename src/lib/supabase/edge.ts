/**
 * FeeLens — Edge Function invocation layer (write-path)
 *
 * Policy:
 * - Business writes must go through Edge Functions (supabase.functions.invoke).
 * - This file contains ONLY Edge invocations + auth gating.
 */

import { createClient } from './client.browser'
import {
  SubmitEntryParams,
  SubmitEntryResponse,
  ReportEntryParams,
  ReportEntryResponse,
  ModerateEntryParams,
  ModerateEntryResponse,
  ApproveProviderParams,
  ApproveProviderResponse,
  ResolveDisputeParams,
  ResolveDisputeResponse,
  RequestUploadUrlParams,
  RequestUploadUrlResponse,
  CreateEntryV2Params,
  CreateEntryV2Response,
  normaliseReportReason,
} from './types'

async function requireUser(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false as const, error: '请先登录' }
  }
  return { ok: true as const, user }
}

async function invokeEdge<T>(
  fnName: string,
  body: Record<string, unknown>,
  requireAuth: boolean = true
): Promise<{ data?: T; error?: string }> {
  const supabase = createClient()

  if (requireAuth) {
    const auth = await requireUser(supabase)
    if (!auth.ok) return { error: auth.error }
  }

  const { data, error } = await supabase.functions.invoke<T>(fnName, { body })
  if (error) {
    console.error(`Edge Function 调用失败 (${fnName}):`, error)
    return { error: error.message || '请求失败，请稍后重试' }
  }
  return { data: data as T }
}

// ==========================================
// Legacy submit-entry
// ==========================================

export async function submitEntry(params: SubmitEntryParams): Promise<SubmitEntryResponse> {
  try {
    const { data, error } = await invokeEdge<SubmitEntryResponse>('submit-entry', params as any, true)
    if (error) return { success: false, error }
    return data as SubmitEntryResponse
  } catch (e) {
    console.error('提交条目时发生错误:', e)
    return { success: false, error: '网络错误，请检查连接后重试' }
  }
}

// ==========================================
// Reports
// ==========================================

export async function reportEntry(params: ReportEntryParams): Promise<ReportEntryResponse> {
  try {
    const body = {
      ...params,
      reason: normaliseReportReason(params.reason),
    }
    const { data, error } = await invokeEdge<ReportEntryResponse>('report-entry', body, true)
    if (error) return { success: false, error }
    return data as ReportEntryResponse
  } catch (e) {
    console.error('举报时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

// ==========================================
// Moderation / Provider approval / Disputes
// ==========================================

export async function moderateEntry(params: ModerateEntryParams): Promise<ModerateEntryResponse> {
  try {
    const { data, error } = await invokeEdge<ModerateEntryResponse>('moderate-entry', params as any, true)
    if (error) return { success: false, error }
    return (data ?? { success: false, error: '审核失败' }) as ModerateEntryResponse
  } catch (e) {
    console.error('审核时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

export async function approveProvider(params: ApproveProviderParams): Promise<ApproveProviderResponse> {
  try {
    const { data, error } = await invokeEdge<ApproveProviderResponse>('approve-provider', params as any, true)
    if (error) return { success: false, error }
    return data as ApproveProviderResponse
  } catch (e) {
    console.error('审核商家时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

export async function resolveDispute(params: ResolveDisputeParams): Promise<ResolveDisputeResponse> {
  try {
    const { data, error } = await invokeEdge<ResolveDisputeResponse>('resolve-dispute', params as any, true)
    if (error) return { success: false, error }
    return data as ResolveDisputeResponse
  } catch (e) {
    console.error('处理争议时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

// ==========================================
// Evidence upload signing
// ==========================================

export async function requestUploadUrl(params: RequestUploadUrlParams): Promise<RequestUploadUrlResponse> {
  try {
    const { data, error } = await invokeEdge<RequestUploadUrlResponse>('upload-sign', params as any, true)
    if (error) return { success: false, error }
    return data as RequestUploadUrlResponse
  } catch (e) {
    console.error('请求上传签名时发生错误:', e)
    return { success: false, error: '网络错误' }
  }
}

// ==========================================
// V2 create-entry-v2
// ==========================================

export async function createEntryV2(params: CreateEntryV2Params): Promise<CreateEntryV2Response> {
  try {
    const { data, error } = await invokeEdge<CreateEntryV2Response>('create-entry-v2', params as any, true)
    if (error) return { success: false, error }
    return data as CreateEntryV2Response
  } catch (e) {
    console.error('创建条目时发生错误:', e)
    return { success: false, error: '网络错误，请检查连接后重试' }
  }
}
