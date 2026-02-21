// src/lib/explore/query.ts
import {
  DEFAULT_INDUSTRY_KEY,
  isEvidenceTier,
  isExploreSort,
  type EvidenceTier,
  type ExploreQuery,
  type ExploreSort,
} from '@/types/explore'

/**
 * Query param convention (v1)
 *
 * industry:   string   (default: real_estate)
 * service:    string
 * state:      string   (e.g. NSW)
 * postcode:   string   (kept as string)
 * suburb:     string
 * q:          string   (free text)
 * minPaid:    number
 * maxPaid:    number
 * tiers:      string   ("A,B" or "A" etc)
 * sort:       ExploreSort (default: newest)
 * page:       number   (1-based; default 1)
 * pageSize:   number   (default 20; clamp 1..100)
 *
 * safety gates (optional; default true)
 * onlyApproved:  "1" | "0"
 * onlyPublic:    "1" | "0"
 * excludeExpired:"1" | "0"
 */

const DEFAULT_SORT: ExploreSort = 'newest'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

type NextSearchParams = Record<string, string | string[] | undefined>

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function parseFloatOrUndefined(v: string | null): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseBoolFlag(v: string | null, defaultValue: boolean): boolean {
  if (v === null) return defaultValue
  if (v === '1' || v.toLowerCase() === 'true') return true
  if (v === '0' || v.toLowerCase() === 'false') return false
  return defaultValue
}

function getOne(sp: URLSearchParams, key: string): string | null {
  const v = sp.get(key)
  if (v === null) return null
  const s = v.trim()
  return s.length ? s : null
}

function normaliseState(v: string | null): string | undefined {
  if (!v) return undefined
  const s = v.trim().toUpperCase()
  return s.length ? s : undefined
}

function normalisePostcode(v: string | null): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  return s.length ? s : undefined
}

function normaliseSuburb(v: string | null): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  return s.length ? s : undefined
}

function parseEvidenceTiers(v: string | null): EvidenceTier[] | undefined {
  if (!v) return undefined
  const parts = v
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

  const tiers: EvidenceTier[] = []
  for (const p of parts) {
    if (isEvidenceTier(p)) tiers.push(p)
  }

  // Deduplicate while preserving order
  const deduped = Array.from(new Set(tiers))
  return deduped.length ? deduped : undefined
}

function ensureURLSearchParams(input?: URLSearchParams | NextSearchParams): URLSearchParams {
  if (!input) return new URLSearchParams()
  if (input instanceof URLSearchParams) return input

  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') sp.set(k, v)
    else if (Array.isArray(v)) {
      // If multiple values exist, join with comma for known multi fields, else take first.
      if (k === 'tiers') sp.set(k, v.join(','))
      else if (v.length) sp.set(k, v[0] ?? '')
    }
  }
  return sp
}

/**
 * Main parser used by /explore route.
 * Accepts either Next.js `searchParams` object or URLSearchParams.
 */
export function parseExploreQuery(input?: URLSearchParams | NextSearchParams): ExploreQuery {
  const sp = ensureURLSearchParams(input)

  const industryKey = getOne(sp, 'industry') ?? DEFAULT_INDUSTRY_KEY
  const serviceKey = getOne(sp, 'service') ?? undefined

  const state = normaliseState(getOne(sp, 'state'))
  const postcode = normalisePostcode(getOne(sp, 'postcode'))
  const suburb = normaliseSuburb(getOne(sp, 'suburb'))

  const q = getOne(sp, 'q') ?? undefined

  const minPaid = parseFloatOrUndefined(getOne(sp, 'minPaid'))
  const maxPaid = parseFloatOrUndefined(getOne(sp, 'maxPaid'))

  const tiers = parseEvidenceTiers(getOne(sp, 'tiers'))

  const sortRaw = getOne(sp, 'sort')
  const sort: ExploreSort = sortRaw && isExploreSort(sortRaw) ? (sortRaw as ExploreSort) : DEFAULT_SORT

  const pageRaw = parseFloatOrUndefined(getOne(sp, 'page')) ?? DEFAULT_PAGE
  const pageSizeRaw = parseFloatOrUndefined(getOne(sp, 'pageSize')) ?? DEFAULT_PAGE_SIZE

  const page = clampInt(pageRaw, 1, Number.MAX_SAFE_INTEGER)
  const pageSize = clampInt(pageSizeRaw, 1, MAX_PAGE_SIZE)

  const onlyApproved = parseBoolFlag(getOne(sp, 'onlyApproved'), true)
  const onlyPublic = parseBoolFlag(getOne(sp, 'onlyPublic'), true)
  const excludeExpired = parseBoolFlag(getOne(sp, 'excludeExpired'), true)

  const query: ExploreQuery = {
    industryKey,
    serviceKey,

    sort,
    pagination: { page, pageSize },

    onlyApproved,
    onlyPublic,
    excludeExpired,
  }

  if (state || postcode || suburb) {
    query.location = { state, postcode, suburb }
  }

  if (q) {
    query.search = { q }
  }

  if (minPaid !== undefined || maxPaid !== undefined) {
    query.money = { minPaid, maxPaid }
  }

  if (tiers) {
    query.evidenceTiers = tiers
  }

  return query
}

/**
 * Optional helper: serialise ExploreQuery back to a query string.
 * Keeps URLs canonical (only includes non-default / present fields).
 */
export function toExploreSearchParams(q: ExploreQuery): URLSearchParams {
  const sp = new URLSearchParams()

  if (q.industryKey && q.industryKey !== DEFAULT_INDUSTRY_KEY) sp.set('industry', q.industryKey)
  if (q.serviceKey) sp.set('service', q.serviceKey)

  if (q.location?.state) sp.set('state', q.location.state)
  if (q.location?.postcode) sp.set('postcode', q.location.postcode)
  if (q.location?.suburb) sp.set('suburb', q.location.suburb)

  if (q.search?.q) sp.set('q', q.search.q)

  if (q.money?.minPaid !== undefined) sp.set('minPaid', String(q.money.minPaid))
  if (q.money?.maxPaid !== undefined) sp.set('maxPaid', String(q.money.maxPaid))

  if (q.evidenceTiers?.length) sp.set('tiers', q.evidenceTiers.join(','))

  if (q.sort !== DEFAULT_SORT) sp.set('sort', q.sort)

  if (q.pagination.page !== DEFAULT_PAGE) sp.set('page', String(q.pagination.page))
  if (q.pagination.pageSize !== DEFAULT_PAGE_SIZE) sp.set('pageSize', String(q.pagination.pageSize))

  // Safety gates: only include when deviating from defaults
  if (q.onlyApproved === false) sp.set('onlyApproved', '0')
  if (q.onlyPublic === false) sp.set('onlyPublic', '0')
  if (q.excludeExpired === false) sp.set('excludeExpired', '0')

  return sp
}