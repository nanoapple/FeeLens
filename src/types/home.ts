// src/types/home.ts
// ==========================================
// FeeLens — Home API Contract Types (v1.1)
//
// Changelog from v1.0:
//   - Renamed hidden_fees_exposed_label → fees_tracked_label
//     (matches actual computation: sum of ALL display_total, not just hidden fees)
//   - Stats now come from rpc_home_stats() — single DB call
// ==========================================

export type HomeResponse = {
  version: 'v1'
  stats: HomeStats
  recent_reports: RecentReportCard[]
  popular: PopularLink[]
}

export type HomeStats = {
  /** Count of fee_entries where moderation_status='approved' */
  approved_fee_entries_total: number
  /** Count of providers where status='approved' */
  approved_providers_total: number
  /** Count of active industry_schemas */
  industries_total: number
  /** Display-ready total: "$4.2M" — sum of all public entry totals */
  fees_tracked_label: string
  /** ISO8601 timestamp of when stats were computed */
  generated_at: string
}

export type RecentReportCard = {
  entry_id: string
  provider_name: string
  industry_key: string
  /** Server-formatted: "Parramatta, NSW" */
  location_label: string
  /** Display total: "$220" or "—" */
  total_label: string
  /** Evidence tier: A / B / C */
  evidence_tier: string
  /** Quote transparency: 1-5 or null */
  transparency_score: number | null
  /** ISO8601 */
  created_at: string
}

export type PopularLink = {
  label: string
  href: string
}

export type HomeErrorResponse = {
  ok: false
  error_code: 'HOME_FEED_UNAVAILABLE'
  message: string
}
