// src/app/api/explore/route.ts
// ==========================================
// FeeLens — Explore API (v1.1)
//
// GET /api/explore → ExploreResponseDTO
//
// Data source: v_public_entries (view)
//   - Already filters: visibility='public', moderation_status='approved', provider approved
//   - Joins provider fields (name, slug, state, postcode, suburb, geo)
//
// Security:
//   - Read-only, public data (no auth required)
//   - Service role client used server-side only (consistent with /api/home)
//   - No write operations
//
// Caching:
//   - revalidate: 30 (ISR — short cache for near-real-time data)
// ==========================================

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/client.service'
import { parseExploreQuery } from '@/lib/explore/query'
import type {
  ExploreResponseDTO,
  ExploreItemDTO,
  ExploreSummaryDTO,
  ExploreSort,
  EvidenceTier,
} from '@/types/explore'

export const runtime = 'nodejs'
export const revalidate = 30

// ── Column select — only what ExploreItemDTO needs ──────────────────
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

// ── Sort mapping ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySortOrder(query: any, sort: ExploreSort) {
  switch (sort) {
    case 'oldest':
      return query.order('created_at', { ascending: true, nullsFirst: false })
    case 'highest_paid':
      return query.order('display_total', { ascending: false, nullsFirst: false })
    case 'lowest_paid':
      return query.order('display_total', { ascending: true, nullsFirst: false })
    case 'highest_delta':
      return query.order('delta_pct', { ascending: false, nullsFirst: false })
    case 'lowest_delta':
      return query.order('delta_pct', { ascending: true, nullsFirst: false })
    case 'best_evidence':
      // A < B < C alphabetically; ascending puts A (best) first
      return query.order('evidence_tier', { ascending: true, nullsFirst: false })
    case 'newest':
    default:
      return query.order('created_at', { ascending: false, nullsFirst: false })
  }
}

// ── Map DB row → ExploreItemDTO ─────────────────────────────────────
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

// ── Compute summary from current page items ─────────────────────────
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

// ── GET handler ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const query = parseExploreQuery(url.searchParams)

    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbQuery: any = supabase
      .from('v_public_entries')
      .select(VIEW_COLUMNS, { count: 'exact' })

    // ── Filters ───────────────────────────────────────────────────
    // Industry (always applied)
    dbQuery = dbQuery.eq('industry_key', query.industryKey)

    // Expiry: exclude expired entries (default behaviour)
    if (query.excludeExpired !== false) {
      const today = new Date().toISOString().slice(0, 10)
      dbQuery = dbQuery.or(`expiry_date.is.null,expiry_date.gte.${today}`)
    }

    // Location filters (AND logic)
    if (query.location?.state) {
      dbQuery = dbQuery.ilike('provider_state', query.location.state)
    }
    if (query.location?.postcode) {
      dbQuery = dbQuery.eq('provider_postcode', query.location.postcode)
    }
    if (query.location?.suburb) {
      dbQuery = dbQuery.ilike('provider_suburb', `%${query.location.suburb}%`)
    }

    // Evidence tier filter
    if (query.evidenceTiers?.length) {
      dbQuery = dbQuery.in('evidence_tier', query.evidenceTiers)
    }

    // Free text search (provider name, suburb, or postcode)
    if (query.search?.q) {
      const q = query.search.q.trim()
      if (q.length > 0) {
        dbQuery = dbQuery.or(
          `provider_name.ilike.%${q}%,provider_suburb.ilike.%${q}%,provider_postcode.eq.${q}`
        )
      }
    }

    // Money filters
    if (query.money?.minPaid != null) {
      dbQuery = dbQuery.gte('display_total', query.money.minPaid)
    }
    if (query.money?.maxPaid != null) {
      dbQuery = dbQuery.lte('display_total', query.money.maxPaid)
    }

    // ── Sort ──────────────────────────────────────────────────────
    dbQuery = applySortOrder(dbQuery, query.sort)

    // ── Pagination (Supabase range is 0-based inclusive) ──────────
    const pageSize = query.pagination.pageSize
    const page = query.pagination.page
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    dbQuery = dbQuery.range(from, to)

    // ── Execute ──────────────────────────────────────────────────
    const { data: rows, count, error } = await dbQuery

    if (error) {
      console.error('[/api/explore] Supabase error:', error)
      return NextResponse.json(
        { error: `Database query failed: ${error.message}` },
        { status: 503 }
      )
    }

    const totalCount = count ?? 0
    const items: ExploreItemDTO[] = (rows ?? []).map(mapRowToItem)
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

    const response: ExploreResponseDTO = {
      items,
      summary: computeSummary(items, totalCount),
      meta: {
        page: Math.min(page, totalPages),
        pageSize,
        totalPages,
        totalCount,
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/explore] Unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
