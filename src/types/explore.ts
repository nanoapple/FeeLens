// src/types/explore.ts

/**
 * Explore v1 contract (no map required).
 *
 * Design goals:
 * - Stable DTOs between API/UI and DB view/RPC
 * - Minimal but extensible (future: map, dispute/report badges, richer stats)
 * - Default industry: real_estate
 */

export const DEFAULT_INDUSTRY_KEY = 'real_estate' as const

// ---------------------------
// Query (filters, sort, paging)
// ---------------------------

export type IndustryKey = typeof DEFAULT_INDUSTRY_KEY | (string & {}) // allow future industries without refactor
export type ServiceKey = string

export type EvidenceTier = 'A' | 'B' | 'C'
export type DisputeStatus = 'none' | 'pending' | 'resolved'
export type ModerationStatus = 'unreviewed' | 'approved' | 'flagged' | 'rejected'
export type Visibility = 'public' | 'hidden' | 'flagged'

/**
 * Location filter strategy:
 * - v1 supports state/postcode/suburb queries.
 * - We intentionally keep them optional and "AND" logic lives in query layer.
 */
export interface ExploreLocationFilter {
  state?: string // e.g. "NSW"
  postcode?: string // keep as string (leading zeros, if any)
  suburb?: string // e.g. "Sydney"
}

/**
 * Search query:
 * - free text that may match provider name, suburb, postcode, etc.
 * - query layer decides which fields to target.
 */
export interface ExploreSearchFilter {
  q?: string
}

/**
 * Money filter:
 * - amounts are in AUD.
 * - use numbers in API; formatting is UI responsibility.
 */
export interface ExploreMoneyFilter {
  minPaid?: number
  maxPaid?: number
}

/**
 * Sorting:
 * - Keep as a tight union so UI options are deterministic.
 * - Query layer will translate to DB order_by.
 */
export type ExploreSort =
  | 'newest'
  | 'oldest'
  | 'highest_paid'
  | 'lowest_paid'
  | 'highest_delta'
  | 'lowest_delta'
  | 'best_evidence' // A > B > C

export interface ExplorePagination {
  page: number // 1-based
  pageSize: number // e.g. 20
}

/**
 * ExploreQuery is the single source of truth for the Explore request.
 * Defaults should be applied in query.ts (not here).
 */
export interface ExploreQuery {
  industryKey: IndustryKey // default real_estate
  serviceKey?: ServiceKey

  location?: ExploreLocationFilter
  search?: ExploreSearchFilter
  money?: ExploreMoneyFilter

  evidenceTiers?: EvidenceTier[] // if undefined -> all tiers
  // v1 safety gates (usually enforced server-side and NOT exposed as UI controls)
  onlyApproved?: boolean // default true
  onlyPublic?: boolean // default true
  excludeExpired?: boolean // default true

  sort: ExploreSort
  pagination: ExplorePagination
}

// ---------------------------
// Response DTOs (list + summary + meta)
// ---------------------------

/**
 * Provider minimal fields required for Explore list cards.
 */
export interface ExploreProviderDTO {
  id: string
  slug: string
  name: string

  suburb?: string | null
  state?: string | null
  postcode?: string | null

  // Map is v2; keep optional but in contract so adding it later is non-breaking.
  geoLat?: number | null
  geoLng?: number | null

  status?: 'pending' | 'approved' | 'rejected' | 'suspended' // optional: server may omit
}

/**
 * Fee entry minimal fields required for Explore list cards.
 */
export interface ExploreEntryDTO {
  id: string

  industryKey: IndustryKey
  serviceKey?: ServiceKey | null

  submitDate: string // ISO date: YYYY-MM-DD (from fee_entries.submit_date)
  createdAt?: string | null // ISO timestamp, optional

  evidenceTier: EvidenceTier

  initialQuoteTotal?: number | null
  finalTotalPaid?: number | null
  deltaPct?: number | null

  hiddenItemsCount?: number | null // derived from hidden_items length (prefer server-side)
  quoteTransparencyScore?: number | null // 1..5 optional

  disputeStatus?: DisputeStatus | null

  // v1 safety gates: may be included for debugging/admin but UI should not rely on them
  moderationStatus?: ModerationStatus
  visibility?: Visibility
}

/**
 * One item shown in Explore list.
 * Keep provider + entry together so UI does not need separate lookups.
 */
export interface ExploreItemDTO {
  entry: ExploreEntryDTO
  provider: ExploreProviderDTO
}

/**
 * Summary statistics shown above/alongside the list.
 * Keep minimal: counts and paid distribution.
 */
export interface ExploreSummaryDTO {
  totalCount: number

  // Paid distribution on final_total_paid (AUD)
  paidP25?: number | null
  paidP50?: number | null
  paidP75?: number | null

  // Optional: average delta for transparency narrative
  avgDeltaPct?: number | null

  // Optional: evidence distribution for badges/legend
  evidenceCounts?: Partial<Record<EvidenceTier, number>>
}

/**
 * Response meta: deterministic pagination + echo query for debugging.
 */
export interface ExploreMetaDTO {
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
}

export interface ExploreResponseDTO {
  items: ExploreItemDTO[]
  summary: ExploreSummaryDTO
  meta: ExploreMetaDTO
}

// ---------------------------
// Utilities (narrow, type-safe)
// ---------------------------

export function isEvidenceTier(v: unknown): v is EvidenceTier {
  return v === 'A' || v === 'B' || v === 'C'
}

export function isExploreSort(v: unknown): v is ExploreSort {
  return (
    v === 'newest' ||
    v === 'oldest' ||
    v === 'highest_paid' ||
    v === 'lowest_paid' ||
    v === 'highest_delta' ||
    v === 'lowest_delta' ||
    v === 'best_evidence'
  )
}