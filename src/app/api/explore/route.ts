// src/app/api/explore/route.ts

import { NextResponse } from 'next/server'
import { parseExploreQuery } from '@/lib/explore/query'
import type { ExploreResponseDTO } from '@/types/explore'

export const runtime = 'nodejs' // 保守：避免 edge 环境差异（后续你们要上 edge 再改）

function buildStubResponse(): ExploreResponseDTO {
  return {
    items: [
      {
        provider: {
          id: 'prov_1',
          slug: 'sample-provider-1',
          name: 'Sample Property Management',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          geoLat: null,
          geoLng: null,
          status: 'approved',
        },
        entry: {
          id: 'entry_1',
          industryKey: 'real_estate',
          serviceKey: 'property_management',
          submitDate: '2026-02-21',
          createdAt: null,
          evidenceTier: 'A',
          initialQuoteTotal: 1800,
          finalTotalPaid: 2400,
          deltaPct: 33.33,
          hiddenItemsCount: 2,
          quoteTransparencyScore: 3,
          disputeStatus: 'none',
          moderationStatus: 'approved',
          visibility: 'public',
        },
      },
      {
        provider: {
          id: 'prov_2',
          slug: 'sample-provider-2',
          name: 'Example Realty Services',
          suburb: 'Parramatta',
          state: 'NSW',
          postcode: '2150',
          geoLat: null,
          geoLng: null,
          status: 'approved',
        },
        entry: {
          id: 'entry_2',
          industryKey: 'real_estate',
          serviceKey: 'letting',
          submitDate: '2026-02-18',
          createdAt: null,
          evidenceTier: 'B',
          initialQuoteTotal: 950,
          finalTotalPaid: 980,
          deltaPct: 3.16,
          hiddenItemsCount: 0,
          quoteTransparencyScore: 4,
          disputeStatus: 'pending',
          moderationStatus: 'approved',
          visibility: 'public',
        },
      },
    ],
    summary: {
      totalCount: 2,
      paidP25: 980,
      paidP50: 1690,
      paidP75: 2400,
      avgDeltaPct: 18.25,
      evidenceCounts: { A: 1, B: 1, C: 0 },
    },
    meta: {
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalCount: 2,
    },
  }
}

/**
 * GET /api/explore
 * Returns ExploreResponseDTO
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const query = parseExploreQuery(url.searchParams)

    // Stub data for v1 wiring; replace with Supabase view/RPC later
    const base = buildStubResponse()

    // Minimal, deterministic filtering to match query contract (so UI behaves predictably)
    let items = base.items

    // industry filter (default real_estate)
    items = items.filter((x) => x.entry.industryKey === query.industryKey)

    // evidence tier filter
    if (query.evidenceTiers?.length) {
      const set = new Set(query.evidenceTiers)
      items = items.filter((x) => set.has(x.entry.evidenceTier))
    }

    // location filters (simple AND)
    if (query.location?.state) items = items.filter((x) => (x.provider.state ?? '').toUpperCase() === query.location!.state)
    if (query.location?.postcode) items = items.filter((x) => (x.provider.postcode ?? '') === query.location!.postcode)
    if (query.location?.suburb) {
      const s = query.location.suburb.trim().toLowerCase()
      items = items.filter((x) => (x.provider.suburb ?? '').toLowerCase().includes(s))
    }

    // free text search (provider name / suburb / postcode)
    if (query.search?.q) {
      const q = query.search.q.trim().toLowerCase()
      items = items.filter((x) => {
        const name = x.provider.name.toLowerCase()
        const suburb = (x.provider.suburb ?? '').toLowerCase()
        const postcode = (x.provider.postcode ?? '').toLowerCase()
        return name.includes(q) || suburb.includes(q) || postcode.includes(q)
      })
    }

    // sort (subset)
    items = sortItems(items, query.sort)

    // pagination
    const totalCount = items.length
    const pageSize = query.pagination.pageSize
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const page = Math.min(Math.max(1, query.pagination.page), totalPages)
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)

    const res: ExploreResponseDTO = {
      items: paged,
      summary: {
        ...base.summary,
        totalCount,
      },
      meta: {
        page,
        pageSize,
        totalPages,
        totalCount,
      },
    }

    return NextResponse.json(res)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function sortItems(items: ExploreResponseDTO['items'], sort: string): ExploreResponseDTO['items'] {
  const copy = [...items]

  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => a.entry.submitDate.localeCompare(b.entry.submitDate))
    case 'highest_paid':
      return copy.sort((a, b) => (b.entry.finalTotalPaid ?? -Infinity) - (a.entry.finalTotalPaid ?? -Infinity))
    case 'lowest_paid':
      return copy.sort((a, b) => (a.entry.finalTotalPaid ?? Infinity) - (b.entry.finalTotalPaid ?? Infinity))
    case 'highest_delta':
      return copy.sort((a, b) => (b.entry.deltaPct ?? -Infinity) - (a.entry.deltaPct ?? -Infinity))
    case 'lowest_delta':
      return copy.sort((a, b) => (a.entry.deltaPct ?? Infinity) - (b.entry.deltaPct ?? Infinity))
    case 'best_evidence': {
      const rank = (t: string) => (t === 'A' ? 3 : t === 'B' ? 2 : 1)
      return copy.sort((a, b) => rank(b.entry.evidenceTier) - rank(a.entry.evidenceTier))
    }
    case 'newest':
    default:
      return copy.sort((a, b) => b.entry.submitDate.localeCompare(a.entry.submitDate))
  }
}