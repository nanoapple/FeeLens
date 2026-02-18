//src/app/(main)/entries/page.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import { useIndustryList } from '@/hooks/use-industry-schema'

interface EntryRow {
  id: string
  provider_id: string
  provider_name: string
  provider_slug: string
  provider_state: string
  provider_postcode: string
  provider_suburb: string
  industry_key: string
  service_key: string | null
  fee_breakdown: Record<string, unknown>
  context: Record<string, unknown>
  pricing_model: string
  display_total: number | null
  evidence_tier: string
  quote_transparency_score: number | null
  created_at: string
}

const SERVICE_LABELS: Record<string, string> = {
  conveyancing: 'Conveyancing',
  workers_compensation: 'Workers Compensation',
  family_law: 'Family Law',
  migration: 'Migration',
  property_management: 'Property Management',
}

const PRICING_MODEL_LABELS: Record<string, string> = {
  fixed: 'Fixed', hourly: 'Hourly', blended: 'Blended',
  retainer: 'Retainer', conditional: 'Conditional', legacy: 'Standard',
}

export default function EntriesListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { industries } = useIndustryList()

  const [industryFilter, setIndustryFilter] = useState(searchParams.get('industry') || '')
  const [serviceFilter, setServiceFilter] = useState(searchParams.get('service') || '')
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || '')

  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const supabase = createServerSupabaseClient()
    let query = supabase.from('v_public_entries').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(PAGE_SIZE)
    if (industryFilter) query = query.eq('industry_key', industryFilter)
    if (serviceFilter) query = query.eq('service_key', serviceFilter)
    if (stateFilter) query = query.eq('provider_state', stateFilter)

    const { data, count, error } = await query
    if (error) { console.error('Failed to fetch entries:', error); setEntries([]) }
    else { setEntries((data || []) as EntryRow[]); setTotal(count || 0) }
    setLoading(false)
  }, [industryFilter, serviceFilter, stateFilter])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  useEffect(() => {
    const params = new URLSearchParams()
    if (industryFilter) params.set('industry', industryFilter)
    if (serviceFilter) params.set('service', serviceFilter)
    if (stateFilter) params.set('state', stateFilter)
    const qs = params.toString()
    router.replace(`/entries${qs ? '?' + qs : ''}`, { scroll: false })
  }, [industryFilter, serviceFilter, stateFilter, router])

  function formatCurrency(amount: number | null) {
    if (amount == null) return '\u2014'
    return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function getDisplayPrice(entry: EntryRow): string {
    const fb = entry.fee_breakdown
    if (!fb) return '\u2014'
    if (fb.fixed_fee_amount) return formatCurrency(fb.fixed_fee_amount as number)
    if (fb.hourly_rate) return `${formatCurrency(fb.hourly_rate as number)}/hr`
    if (fb.retainer_amount) return formatCurrency(fb.retainer_amount as number)
    if (fb.management_fee_pct) return `${fb.management_fee_pct}%`
    if (entry.display_total) return formatCurrency(entry.display_total)
    return '\u2014'
  }

  function getEvidenceBadgeColor(tier: string) {
    switch (tier) {
      case 'A': return 'bg-green-100 text-green-700'
      case 'B': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fee Entries</h1>
            <p className="text-sm text-gray-500 mt-1">{total} {total === 1 ? 'entry' : 'entries'} found</p>
          </div>
          <a href="/" className="text-sm text-gray-500 hover:text-orange-600">&larr; Home</a>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          <select value={industryFilter} onChange={(e) => { setIndustryFilter(e.target.value); setServiceFilter('') }} className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="">All Industries</option>
            {industries.map((ind) => (<option key={ind.key} value={ind.key}>{ind.name}</option>))}
          </select>
          {industryFilter === 'legal_services' && (
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">All Services</option>
              <option value="conveyancing">Conveyancing</option>
              <option value="workers_compensation">Workers Compensation</option>
              <option value="family_law">Family Law</option>
              <option value="migration">Migration</option>
            </select>
          )}
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="">All States</option>
            <option value="NSW">NSW</option><option value="VIC">VIC</option><option value="QLD">QLD</option>
            <option value="SA">SA</option><option value="WA">WA</option><option value="TAS">TAS</option>
            <option value="NT">NT</option><option value="ACT">ACT</option>
          </select>
          {(industryFilter || serviceFilter || stateFilter) && (
            <button onClick={() => { setIndustryFilter(''); setServiceFilter(''); setStateFilter('') }} className="text-xs text-gray-500 hover:text-orange-600 underline">Clear filters</button>
          )}
        </div>

        {/* Entry cards */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12"><p className="text-gray-500">No entries found matching your filters.</p></div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <a key={entry.id} href={`/entries/${entry.id}`} className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-orange-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{entry.provider_name}</h3>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{entry.provider_suburb}, {entry.provider_state} {entry.provider_postcode}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{entry.industry_key === 'real_estate' ? 'Property' : 'Legal'}</span>
                      {entry.service_key && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">{SERVICE_LABELS[entry.service_key] || entry.service_key}</span>}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{PRICING_MODEL_LABELS[entry.pricing_model] || entry.pricing_model}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getEvidenceBadgeColor(entry.evidence_tier)}`}>Tier {entry.evidence_tier}</span>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-lg font-bold text-gray-900">{getDisplayPrice(entry)}</div>
                    {entry.display_total && entry.display_total !== (entry.fee_breakdown?.fixed_fee_amount as number) && (
                      <div className="text-xs text-gray-500">est. total {formatCurrency(entry.display_total)}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">{formatDate(entry.created_at)}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
