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
// Evidence upload
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
// V2 (schema-driven) create-entry-v2
// ==========================================

export type PricingModel =
  | 'hourly'
  | 'fixed'
  | 'capped'
  | 'retainer'
  | 'contingency_pct'
  | 'uplift'
  | 'blended'
  | 'other'

export interface DisbursementItem {
  label: string
  amount: number
  is_estimate?: boolean
}

export interface FeeBreakdown {
  pricing_model: PricingModel
  hourly_rate?: number
  estimated_hours?: number
  fixed_fee_amount?: number
  cap_amount?: number
  retainer_amount?: number
  gst_included?: boolean
  disbursements_items?: DisbursementItem[]
  disbursements_total?: number
  total_estimated?: number
  [key: string]: unknown
}

export interface EntryContext {
  matter_type?: string
  jurisdiction?: string
  client_type?: string
  complexity_band?: string
  // conveyancing
  property_value?: number
  transaction_side?: string
  property_type?: string
  // workers compensation
  claim_stage?: string
  damages_claim?: boolean
  estimated_claim_value?: number
  // family law
  court_stage?: string
  children_involved?: boolean
  // migration
  visa_type?: string
  application_stage?: string
  // allow additional keys
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
