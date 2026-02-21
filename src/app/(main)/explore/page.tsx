// src/app/(main)/explore/page.tsx
// ==========================================
// Explore Page — Server Component
//
// Single source of truth: GET /api/explore (service-role query, DTO stable)
//
// Why:
// - Avoid duplicated DB logic between page + API
// - Avoid Next 16 cookies()/server client integration issues
// - Ensure Explore page matches API behaviour exactly
// ==========================================

import ExploreShell from '@/components/explore/ExploreShell'
import { parseExploreQuery } from '@/lib/explore/query'
import type { ExploreResponseDTO } from '@/types/explore'
import { headers } from 'next/headers'

export const revalidate = 30

type SearchParams = Record<string, string | string[] | undefined>

function toQueryString(sp: SearchParams): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      for (const x of v) params.append(k, x)
    } else {
      params.set(k, v)
    }
  }
  return params.toString()
}

function emptyResponse(pageSize: number): ExploreResponseDTO {
  return {
    items: [],
    summary: { totalCount: 0 },
    meta: { page: 1, pageSize, totalPages: 1, totalCount: 0 },
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {}
  const query = parseExploreQuery(sp)

  // Build absolute base URL (Next 16 server fetch often needs absolute URL)
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const baseUrl = `${proto}://${host}`

  const qs = toQueryString(sp)
  const url = `${baseUrl}/api/explore${qs ? `?${qs}` : ''}`

  let data: ExploreResponseDTO = emptyResponse(query.pagination.pageSize)

  try {
    const res = await fetch(url, { next: { revalidate } })
    if (!res.ok) {
      // API should return JSON; but if it doesn't, degrade gracefully
      console.error('[explore/page] /api/explore returned non-OK:', res.status, res.statusText)
      return <ExploreShell query={query} data={data} />
    }

    const json = (await res.json()) as ExploreResponseDTO
    // minimal sanity check
    if (!json || !Array.isArray(json.items) || !json.meta) {
      console.error('[explore/page] /api/explore returned unexpected payload shape')
      return <ExploreShell query={query} data={data} />
    }

    data = json
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[explore/page] fetch /api/explore failed:', msg)
  }

  return <ExploreShell query={query} data={data} />
}