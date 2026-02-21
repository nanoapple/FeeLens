// src/app/(main)/explore/page.tsx

import ExploreShell from '@/components/explore/ExploreShell'
import { parseExploreQuery } from '@/lib/explore/query'
import type { ExploreResponseDTO } from '@/types/explore'

type SearchParams = Record<string, string | string[] | undefined>

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

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  // Next.js 16: searchParams is often a Promise in server components.
  const sp = (await Promise.resolve(searchParams)) ?? {}
  const query = parseExploreQuery(sp)

  // v1: stub data (replace with real data fetch later)
  const data = buildStubResponse()

  return <ExploreShell query={query} data={data} />
}