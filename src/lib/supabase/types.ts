/**
 * FeeLens — Supabase write-contract types
 * Keep this file aligned with DB constraints (migrations) and Edge Function contracts.
 */

// ==========================================
// Legacy submit-entry (real_estate v1)
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

// ==========================================
// Reports (entry_reports.reason_code)
// ==========================================

export type ReportReasonCode =
  | 'price_incorrect'
  | 'service_not_delivered'
  | 'duplicate'
  | 'fraud'
  | 'expired'
  | 'offensive'
  | 'other'

// Back-compat: older UI used these; we normalise before sending to Edge Function.
export type LegacyReportReason = 'inaccurate' | 'fake'

export type ReportReason = ReportReasonCode | LegacyReportReason

export function normaliseReportReason(reason: ReportReason): ReportReasonCode {
  if (reason === 'inaccurate') return 'price_incorrect'
  if (reason === 'fake') return 'fraud'
  return reason
}

export interface ReportEntryParams {
  entry_id: string
  /**
   * DB-aligned: entry_reports.reason_code
   * New: price_incorrect | service_not_delivered | duplicate | fraud | expired | offensive | other
   * Legacy: inaccurate -> price_incorrect, fake -> fraud
   */
  reason: ReportReason
  details?: string
}

export interface ReportEntryResponse {
  success: boolean
  report_id?: string
  error?: string
}

// ==========================================
// Moderation / Provider approval / Disputes
// ==========================================

export interface ModerateEntryParams {
  entry_id: string
  action: 'approve' | 'reject' | 'hide'
  reason?: string
}

export interface ModerateEntryResponse {
  success: boolean
  new_visibility?: string
  moderation_status?: string
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
// Report-only resolution（不动 entry）
//
// 对齐 DB: resolve_entry_report(p_report_id, p_action, p_note)
// 见 migration: 20260218000004_patch_resolve_entry_report.sql
//
// 关键：这三个 action 都不修改 fee_entries 任何字段。
// 如需连带处理 entry，请使用 moderateEntry()（走 Entries tab）。
// ==========================================

export type ResolveReportAction = 'resolve' | 'dismiss' | 'triage'

export interface ResolveEntryReportParams {
  report_id: string
  /**
   * resolve  → entry_reports.status = 'resolved'（认定举报有效，已处理）
   * dismiss  → entry_reports.status = 'dismissed'（驳回，举报无效）
   * triage   → entry_reports.status = 'triaged'（标记待进一步调查，仅 open 可用）
   */
  action: ResolveReportAction
  note?: string
}

export interface ResolveEntryReportResponse {
  success: boolean
  old_status?: string
  new_status?: string
  error?: string
}

// ==========================================
// Evidence Upload
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
// create-entry-v2
// ==========================================

export interface DisbursementItem {
  label: string
  amount: number
  is_estimate?: boolean
}

export interface FeeBreakdown {
  pricing_model: 'fixed' | 'hourly' | 'blended' | 'retainer' | 'conditional'
  fixed_fee_amount?: number
  hourly_rate?: number
  estimated_hours?: number
  retainer_amount?: number
  uplift_pct?: number
  contingency_pct?: number
  disbursements_total?: number
  disbursements_items?: DisbursementItem[]
  gst_included: boolean
  total_estimated?: number
}

export interface EntryContext {
  matter_type?: string
  jurisdiction?: string
  client_type?: string
  complexity_band?: string
  urgency?: string
  property_value?: number
  transaction_side?: string
  property_type?: string
  claim_stage?: string
  damages_claim?: boolean
  estimated_claim_value?: number
  court_stage?: string
  children_involved?: boolean
  visa_type?: string
  application_stage?: string
  [key: string]: unknown
}

export interface CreateEntryV2Params {
  provider_id: string
  industry_key: string
  service_key?: string
  fee_breakdown: FeeBreakdown
  context?: EntryContext
  hidden_items?: string[]
  quote_transparency_score?: number
  initial_quote_total?: number
  final_total_paid?: number
  evidence_object_key?: string
}

export interface CreateEntryV2Response {
  success: boolean
  entry_id?: string
  visibility?: string
  requires_moderation?: boolean
  risk_flags?: string[]
  evidence_tier?: string
  moderation_status?: string
  error?: string
  details?: unknown
}
