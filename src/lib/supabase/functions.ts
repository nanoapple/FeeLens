// ==========================================
// Edge Functions 封装层
// 所有写入操作必须通过此文件的函数调用
// ==========================================

import { createClient } from './client'

// ==========================================
// 类型定义
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
// Edge Function 调用封装
// ==========================================

/**
 * 提交费用条目
 * 调用 Edge Function: submit-entry
 * 最终调用 RPC: submit_fee_entry
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
 * RPC 内部通过 auth.uid() 识别举报人，不传 user_id
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
 * RPC 内部通过 auth.uid() 识别管理员，不传 admin_id
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
 * RPC 内部通过 auth.uid() 识别管理员，不传 admin_id
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
 * RPC 内部通过 auth.uid() 识别管理员，不传 admin_id
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
