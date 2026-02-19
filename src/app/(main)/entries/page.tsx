// src/app/(main)/entries/page.tsx
// ==========================================
// FeeLens — Entries List Page
//
// Public mode: reads from v_public_entries (view, anon-safe)
// Mine mode (?mine=true): reads from fee_entries (RLS: users_read_own_entries)
//   → only selects whitelisted fields (no sensitive columns exposed)
//
// Filters: industry_key, service_key, provider_state
// Sort: created_at DESC, id DESC (stable cursor pagination)
// Pagination: "Load more" with cursor
// ==========================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client.browser'
import { useIndustryList } from '@/hooks/use-industry-schema'

// ── Constants ────────────────────────────────────────────────────────────────

/** View name — single source of truth */
const PUBLIC_ENTRIES_VIEW = 'v_public_entries'

const PAGE_SIZE = 20

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const

const SERVICE_LABELS: Record<string, string> = {
  conveyancing: 'Conveyancing',
  workers_compensation: 'Workers Compensation',
  family_law: 'Family Law',
  migration: 'Migration',
  property_management: 'Property Management',
}

const PRICING_MODEL_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  hourly: 'Hourly',
  blended: 'Blended',
  retainer: 'Retainer',
  conditional: 'Conditional',
  legacy: 'Standard',
}

/** Whitelist of fields to select from fee_entries in "mine" mode.
 *  Never select('*') from fee_entries — it may expose sensitive columns. */
const MINE_SELECT_FIELDS = [
  'id',
  'provider_id',
  'industry_key',
  'service_key',
  'fee_breakdown',
  'context',
  'evidence_tier',
  'quote_transparency_score',
  'initial_quote_total',
  'final_total_paid',
  'visibility',
  'moderation_status',
  'dispute_status',
  'risk_flags',
  'created_at',
].join(',')

// ── Types ────────────────────────────────────────────────────────────────────

interface EntryRow {
  id: string
  provider_id: string
  provider_name?: string
  provider_slug?: string
  provider_state?: string
  provider_postcode?: string
  provider_suburb?: string
  industry_key: string
  service_key: string | null
  fee_breakdown: Record<string, unknown>
  context: Record<string, unknown>
  pricing_model?: string
  display_total?: number | null
  evidence_tier: string
  quote_transparency_score: number | null
  visibility?: string
  moderation_status?: string
  dispute_status?: string
  initial_quote_total?: number | null
  final_total_paid?: number | null
  created_at: string
}

/** Cursor for stable pagination: (created_at, id) */
interface Cursor {
  created_at: string
  id: string
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ visibility, moderationStatus }: { visibility?: string; moderationStatus?: string }) {
  if (moderationStatus === 'flagged' || visibility === 'flagged') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Under Review</span>
  }
  if (visibility === 'hidden') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Hidden</span>
  }
  if (moderationStatus === 'approved' && visibility === 'public') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Live</span>
  }
  if (moderationStatus === 'unreviewed') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Pending</span>
  }
  return null
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function EntriesListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { industries } = useIndustryList()

  // ── Created toast (from submit redirect ?created=1) ───────────────────
  const justCreated = searchParams.get('created') === '1'
  const [showCreatedToast, setShowCreatedToast] = useState(justCreated)

  // Auto-dismiss toast after 5s and strip ?created=1 from URL
  useEffect(() => {
    if (!justCreated) return
    const timer = setTimeout(() => {
      setShowCreatedToast(false)
      // Strip created param from URL (keep other params)
      const params = new URLSearchParams(window.location.search)
      params.delete('created')
      const qs = params.toString()
      router.replace(`/entries${qs ? '?' + qs : ''}`, { scroll: false })
    }, 5000)
    return () => clearTimeout(timer)
  }, [justCreated, router])

  // Filters from URL
  const [industryFilter, setIndustryFilter] = useState(searchParams.get('industry') || '')
  const [serviceFilter, setServiceFilter] = useState(searchParams.get('service') || '')
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || '')
  const isMine = searchParams.get('mine') === 'true'

  // Data
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [hasMore, setHasMore] = useState(false)

  // ── Fetch entries ────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async (append = false, afterCursor?: Cursor) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    const supabase = createClient()

    if (isMine) {
      // Mine mode: query fee_entries with explicit field whitelist
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setEntries([])
        setLoading(false)
        return
      }

      let query = supabase
        .from('fee_entries')
        .select(MINE_SELECT_FIELDS, { count: 'exact' })
        .eq('submitter_user_id', user.id)  // double insurance on top of RLS
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      if (industryFilter) query = query.eq('industry_key', industryFilter)
      if (serviceFilter) query = query.eq('service_key', serviceFilter)

      // Cursor-based pagination: (created_at, id)
      if (afterCursor) {
        query = query.or(
          `created_at.lt.${afterCursor.created_at},and(created_at.eq.${afterCursor.created_at},id.lt.${afterCursor.id})`
        )
      }

      const { data, count, error } = await query
      if (error) {
        console.error('Failed to fetch my entries:', error)
        setEntries(append ? entries : [])
      } else {
        const rows = (data || []) as EntryRow[]
        const merged = append ? [...entries, ...rows] : rows
        setEntries(merged)
        setTotal(count || 0)
        setHasMore(rows.length === PAGE_SIZE)
        if (rows.length > 0) {
          const last = rows[rows.length - 1]
          setCursor({ created_at: last.created_at, id: last.id })
        }
      }
    } else {
      // Public mode: query v_public_entries view
      let query = supabase
        .from(PUBLIC_ENTRIES_VIEW)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      if (industryFilter) query = query.eq('industry_key', industryFilter)
      if (serviceFilter) query = query.eq('service_key', serviceFilter)
      if (stateFilter) query = query.eq('provider_state', stateFilter)

      if (afterCursor) {
        query = query.or(
          `created_at.lt.${afterCursor.created_at},and(created_at.eq.${afterCursor.created_at},id.lt.${afterCursor.id})`
        )
      }

      const { data, count, error } = await query
      if (error) {
        console.error('Failed to fetch entries:', error)
        setEntries(append ? entries : [])
      } else {
        const rows = (data || []) as EntryRow[]
        const merged = append ? [...entries, ...rows] : rows
        setEntries(merged)
        setTotal(count || 0)
        setHasMore(rows.length === PAGE_SIZE)
        if (rows.length > 0) {
          const last = rows[rows.length - 1]
          setCursor({ created_at: last.created_at, id: last.id })
        }
      }
    }

    setLoading(false)
    setLoadingMore(false)
  }, [industryFilter, serviceFilter, stateFilter, isMine])

  // Initial fetch + re-fetch on filter change
  useEffect(() => {
    setCursor(null)
    setHasMore(false)
    fetchEntries(false)
  }, [fetchEntries])

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (isMine) params.set('mine', 'true')
    if (industryFilter) params.set('industry', industryFilter)
    if (serviceFilter) params.set('service', serviceFilter)
    if (stateFilter) params.set('state', stateFilter)
    const qs = params.toString()
    router.replace(`/entries${qs ? '?' + qs : ''}`, { scroll: false })
  }, [industryFilter, serviceFilter, stateFilter, isMine, router])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getDisplayTotal(entry: EntryRow): string {
    const total = entry.display_total
      ?? (entry.fee_breakdown?.total_estimated as number | undefined)
      ?? entry.final_total_paid
      ?? entry.initial_quote_total
    if (total == null) return '—'
    return `$${Number(total).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  function getPricingModel(entry: EntryRow): string {
    const model = entry.pricing_model
      ?? (entry.fee_breakdown?.pricing_model as string | undefined)
      ?? 'legacy'
    return PRICING_MODEL_LABELS[model] || model
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isMine ? 'My Submissions' : 'Fee Entries'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} {total === 1 ? 'entry' : 'entries'} found
            </p>
          </div>
          <a href="/" className="text-sm text-gray-500 hover:text-orange-600">
            ← Home
          </a>
        </div>

        {/* Created toast (one-time, from submit redirect) */}
        {showCreatedToast && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-700 text-lg">✓</span>
              <p className="text-sm font-medium text-green-800">
                Entry submitted successfully. It may take a moment to appear below.
              </p>
            </div>
            <button
              onClick={() => setShowCreatedToast(false)}
              className="text-green-600 hover:text-green-800 text-sm"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          {/* Industry */}
          <select
            value={industryFilter}
            onChange={(e) => { setIndustryFilter(e.target.value); setServiceFilter('') }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Industries</option>
            {industries.map((ind) => (
              <option key={ind.key} value={ind.key}>{ind.name}</option>
            ))}
          </select>

          {/* Service (only for legal) */}
          {industryFilter === 'legal_services' && (
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Services</option>
              {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {/* State (only in public mode) */}
          {!isMine && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All States</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Clear */}
          {(industryFilter || serviceFilter || stateFilter) && (
            <button
              onClick={() => { setIndustryFilter(''); setServiceFilter(''); setStateFilter('') }}
              className="text-xs text-gray-500 hover:text-orange-600 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Entry cards */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">No entries found</p>
            <p className="text-sm mt-2">
              {isMine
                ? 'You haven\'t submitted any entries yet.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {entries.map((entry) => (
                <a
                  key={entry.id}
                  href={`/entries/${entry.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Provider + location */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {entry.provider_name || 'Provider'}
                        </h3>
                        {entry.provider_state && (
                          <span className="text-xs text-gray-500">
                            {entry.provider_suburb ? `${entry.provider_suburb}, ` : ''}{entry.provider_state} {entry.provider_postcode}
                          </span>
                        )}
                      </div>

                      {/* Service + pricing model */}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{SERVICE_LABELS[entry.service_key || ''] || entry.industry_key}</span>
                        <span className="text-gray-300">·</span>
                        <span>{getPricingModel(entry)}</span>
                      </div>

                      {/* Date */}
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(entry.created_at).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </div>
                    </div>

                    {/* Right side: total + badge */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-gray-900">
                        {getDisplayTotal(entry)}
                      </div>
                      <div className="flex items-center gap-2 mt-1 justify-end">
                        {/* Evidence tier */}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          entry.evidence_tier === 'A' ? 'bg-green-100 text-green-700' :
                          entry.evidence_tier === 'B' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          Tier {entry.evidence_tier}
                        </span>
                        {/* Status badge (mine mode) */}
                        {isMine && (
                          <StatusBadge
                            visibility={entry.visibility}
                            moderationStatus={entry.moderation_status}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="text-center mt-6">
                <button
                  onClick={() => fetchEntries(true, cursor ?? undefined)}
                  disabled={loadingMore}
                  className="px-6 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
