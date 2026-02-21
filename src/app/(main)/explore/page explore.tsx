// src/app/(main)/explore/page.tsx
// ==========================================
// Explore Page — Server Component
//
// Fetches real data from v_public_entries via Supabase.
// Reuses the same query parsing as /api/explore.
//
// Data flow:
//   URL params → parseExploreQuery → Supabase query → ExploreShell
//
// Note: For client-side navigation / SPA transitions,
// /api/explore serves the same data as JSON.
// ==========================================

import ExploreShell from '@/components/explore/ExploreShell'
import { parseExploreQuery } from '@/lib/explore/query'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  ExploreResponseDTO,
  ExploreItemDTO,
  ExploreSummaryDTO,
  EvidenceTier,
} from '@/types/explore'

export const revalidate = 30

type SearchParams = Record<string, string | string[] | undefined>

// ── Column select ───────────────────────────────────────────────────
const VIEW_COLUMNS = [
  'id',
  'provider_id',
  'provider_name',
  'provider_slug',
  'provider_state',
  'provider_postcode',
  'provider_suburb',
  'geo_lat',
  'geo_lng',
  'industry_key',
  'service_key',
  'submit_date',
  'created_at',
  'evidence_tier',
  'initial_quote_total',
  'final_total_paid',
  'delta_pct',
  'display_total',
  'hidden_items',
  'quote_transparency_score',
  'dispute_status',
  'moderation_status',
  'visibility',
  'expiry_date',
].join(',')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToItem(row: any): ExploreItemDTO {
  const hiddenItems = Array.isArray(row.hidden_items) ? row.hidden_items : []
  return {
    provider: {
      id: row.provider_id,
      slug: row.provider_slug ?? '',
      name: row.provider_name ?? 'Unknown Provider',
      suburb: row.provider_suburb ?? null,
      state: row.provider_state ?? null,
      postcode: row.provider_postcode ?? null,
      geoLat: row.geo_lat ?? null,
      geoLng: row.geo_lng ?? null,
    },
    entry: {
      id: row.id,
      industryKey: row.industry_key ?? 'real_estate',
      serviceKey: row.service_key ?? null,
      submitDate: row.submit_date ?? '',
      createdAt: row.created_at ?? null,
      evidenceTier: (row.evidence_tier as EvidenceTier) ?? 'C',
      initialQuoteTotal: row.initial_quote_total != null ? Number(row.initial_quote_total) : null,
      finalTotalPaid: row.final_total_paid != null ? Number(row.final_total_paid) : null,
      deltaPct: row.delta_pct != null ? Number(row.delta_pct) : null,
      hiddenItemsCount: hiddenItems.length,
      quoteTransparencyScore: row.quote_transparency_score ?? null,
      disputeStatus: row.dispute_status ?? 'none',
      moderationStatus: row.moderation_status,
      visibility: row.visibility,
    },
  }
}

function computeSummary(items: ExploreItemDTO[], totalCount: number): ExploreSummaryDTO {
  const paidValues = items
    .map((it) => it.entry.finalTotalPaid ?? it.entry.initialQuoteTotal ?? null)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)

  const deltas = items
    .map((it) => it.entry.deltaPct)
    .filter((v): v is number => v != null && Number.isFinite(v))

  const percentile = (sorted: number[], p: number): number | null => {
    if (sorted.length === 0) return null
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)] ?? null
  }

  const evidenceCounts: Partial<Record<EvidenceTier, number>> = {}
  for (const it of items) {
    const tier = it.entry.evidenceTier
    evidenceCounts[tier] = (evidenceCounts[tier] ?? 0) + 1
  }

  return {
    totalCount,
    paidP25: percentile(paidValues, 25),
    paidP50: percentile(paidValues, 50),
    paidP75: percentile(paidValues, 75),
    avgDeltaPct:
      deltas.length > 0
        ? Math.round((deltas.reduce((s, v) => s + v, 0) / deltas.length) * 100) / 100
        : null,
    evidenceCounts,
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {}
  const query = parseExploreQuery(sp)

  // ── Build Supabase query ────────────────────────────────────────
  const supabase = createServerSupabaseClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbQuery: any = supabase
    .from('v_public_entries')
    .select(VIEW_COLUMNS, { count: 'exact' })
    .eq('industry_key', query.industryKey)

  // Expiry filter
  if (query.excludeExpired !== false) {
    const today = new Date().toISOString().slice(0, 10)
    dbQuery = dbQuery.or(`expiry_date.is.null,expiry_date.gte.${today}`)
  }

  // Location
  if (query.location?.state) dbQuery = dbQuery.ilike('provider_state', query.location.state)
  if (query.location?.postcode) dbQuery = dbQuery.eq('provider_postcode', query.location.postcode)
  if (query.location?.suburb) dbQuery = dbQuery.ilike('provider_suburb', `%${query.location.suburb}%`)

  // Evidence tiers
  if (query.evidenceTiers?.length) dbQuery = dbQuery.in('evidence_tier', query.evidenceTiers)

  // Free text
  if (query.search?.q) {
    const q = query.search.q.trim()
    if (q.length > 0) {
      dbQuery = dbQuery.or(
        `provider_name.ilike.%${q}%,provider_suburb.ilike.%${q}%,provider_postcode.eq.${q}`
      )
    }
  }

  // Money
  if (query.money?.minPaid != null) dbQuery = dbQuery.gte('display_total', query.money.minPaid)
  if (query.money?.maxPaid != null) dbQuery = dbQuery.lte('display_total', query.money.maxPaid)

  // Sort
  switch (query.sort) {
    case 'oldest':
      dbQuery = dbQuery.order('created_at', { ascending: true, nullsFirst: false }); break
    case 'highest_paid':
      dbQuery = dbQuery.order('display_total', { ascending: false, nullsFirst: false }); break
    case 'lowest_paid':
      dbQuery = dbQuery.order('display_total', { ascending: true, nullsFirst: false }); break
    case 'highest_delta':
      dbQuery = dbQuery.order('delta_pct', { ascending: false, nullsFirst: false }); break
    case 'lowest_delta':
      dbQuery = dbQuery.order('delta_pct', { ascending: true, nullsFirst: false }); break
    case 'best_evidence':
      dbQuery = dbQuery.order('evidence_tier', { ascending: true, nullsFirst: false }); break
    default:
      dbQuery = dbQuery.order('created_at', { ascending: false, nullsFirst: false })
  }

  // Pagination
  const pageSize = query.pagination.pageSize
  const page = query.pagination.page
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  dbQuery = dbQuery.range(from, to)

  // Execute
  const { data: rows, count, error } = await dbQuery

  let data: ExploreResponseDTO

  if (error) {
    console.error('[explore/page] Supabase error:', error)
    // Graceful degradation: show empty results
    data = {
      items: [],
      summary: { totalCount: 0 },
      meta: { page: 1, pageSize, totalPages: 1, totalCount: 0 },
    }
  } else {
    const totalCount = count ?? 0
    const items = (rows ?? []).map(mapRowToItem)
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

    data = {
      items,
      summary: computeSummary(items, totalCount),
      meta: {
        page: Math.min(page, totalPages),
        pageSize,
        totalPages,
        totalCount,
      },
    }
  }

  return <ExploreShell query={query} data={data} />
}
