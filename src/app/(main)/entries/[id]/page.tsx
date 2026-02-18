// src/app/(main)/entries/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client.browser'
import { useIndustrySchema } from '@/hooks/use-industry-schema'

interface EntryDetail {
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
  submitter_pseudo_id: string
  evidence_tier: string
  quote_transparency_score: number | null
  hidden_items: string[]
  initial_quote_total: number | null
  final_total_paid: number | null
  delta_pct: number | null
  created_at: string
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Pct$/, '%')
    .replace(/Gst/, 'GST')
}

type UiFormat = 'currency' | 'percent' | 'hours' | 'integer' | 'number' | 'text'

function inferUiFormat(fieldKey: string, prop: any): UiFormat {
  const explicit = prop?.ui_format || prop?.uiFormat || prop?.format
  if (explicit === 'currency' || explicit === 'percent' || explicit === 'hours' || explicit === 'integer' || explicit === 'number' || explicit === 'text') {
    return explicit
  }
  const k = (fieldKey || '').toLowerCase()
  if (k.includes('pct') || k.endsWith('_percent') || k.endsWith('_percentage') || prop?.title?.includes('%')) return 'percent'
  if (k.includes('hour')) return 'hours'
  if (k.includes('amount') || k.includes('fee') || k.includes('rate') || k.includes('total') || k.includes('cost')) return 'currency'
  if (prop?.type === 'integer') return 'integer'
  if (prop?.type === 'number') return 'number'
  return 'text'
}

function formatBySchema(value: unknown, fieldKey: string, prop: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    const fmt = inferUiFormat(fieldKey, prop)
    if (fmt === 'currency') return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
    if (fmt === 'percent') return `${value}%`
    if (fmt === 'hours') return `${value} h`
    if (fmt === 'integer') return `${Math.round(value)}`
    return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(value)
  }
  if (typeof value === 'string') return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export default function EntryDetailPage() {
  const params = useParams()
  const entryId = params?.id as string

  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { schema } = useIndustrySchema(entry?.industry_key || null)

  useEffect(() => {
    async function load() {
      if (!entryId) return
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('v_public_entries')
        .select('*')
        .eq('id', entryId)
        .single()

      if (fetchError || !data) {
        setError('Entry not found')
      } else {
        setEntry(data as EntryDetail)
      }
      setLoading(false)
    }
    load()
  }, [entryId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error || 'Entry not found'}
          </div>
          <a href="/entries" className="inline-block mt-4 text-sm text-orange-600 hover:underline">
            &larr; Back to entries
          </a>
        </div>
      </div>
    )
  }

  const fb = entry.fee_breakdown || {}
  const ctx = entry.context || {}

  const disbursements = ((fb.disbursements_items ?? []) as unknown[]).filter(Boolean) as Array<{
    label: string
    amount: number
    is_estimate?: boolean
  }>

  // ✅ 关键修复：把 unknown 收口成 number|null，再用于条件渲染
  const disbursementsTotal = toNumberOrNull(fb.disbursements_total)

  const feeSchemaProps = (schema?.fee_breakdown_schema?.properties ?? {}) as Record<string, { title?: string }>
  const ctxSchemaProps = (schema?.context_schema?.properties ?? {}) as Record<string, { title?: string }>

  function getLabel(schemaProps: Record<string, { title?: string }>, key: string): string {
    return schemaProps[key]?.title || humanizeKey(key)
  }

  const feeDisplayKeys = Object.keys(fb).filter(
    (k) =>
      !['disbursements_items', 'disbursements_total'].includes(k) &&
      typeof (fb as Record<string, unknown>)[k] !== 'object'
  )
  const ctxDisplayKeys = Object.keys(ctx).filter((k) => typeof (ctx as Record<string, unknown>)[k] !== 'object')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <a href="/entries" className="text-sm text-gray-500 hover:text-orange-600 mb-6 inline-block">
          &larr; Back to entries
        </a>

        {/* Header card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{entry.provider_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {entry.provider_suburb}, {entry.provider_state} {entry.provider_postcode}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {entry.industry_key === 'real_estate' ? 'Property' : 'Legal'}
                </span>
                {entry.service_key && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
                    {humanizeKey(entry.service_key)}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    entry.evidence_tier === 'A'
                      ? 'bg-green-100 text-green-700'
                      : entry.evidence_tier === 'B'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Evidence Tier {entry.evidence_tier}
                </span>
                {entry.quote_transparency_score !== null && entry.quote_transparency_score !== undefined && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                    Transparency: {entry.quote_transparency_score}/5
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              {entry.display_total !== null && entry.display_total !== undefined && (
                <div className="text-2xl font-bold text-gray-900">
                  ${entry.display_total.toLocaleString('en-AU')}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1">
                {new Date(entry.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="text-xs text-gray-400">by {entry.submitter_pseudo_id}</div>
            </div>
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Fee Breakdown</h2>

          <div className="space-y-2">
            {feeDisplayKeys.map((key) => (
              <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{getLabel(feeSchemaProps, key)}</span>
                <span className="text-sm font-medium text-gray-900">{formatBySchema(fb[key], key, feeSchemaProps?.[key])}</span>
              </div>
            ))}
          </div>

          {disbursements.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Disbursements</h3>
              <div className="space-y-2">
                {disbursements.map((d, idx) => (
                  <div key={idx} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-600">
                      {d.label}
                      {d.is_estimate && (
                        <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          estimate
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-gray-900">${d.amount.toLocaleString('en-AU')}</span>
                  </div>
                ))}

                {/* ✅ 修复后的条件渲染：disbursementsTotal 已收口为 number|null */}
                {disbursementsTotal !== null && (
                  <div className="flex justify-between pt-2 font-semibold">
                    <span className="text-sm text-gray-700">Disbursements Total</span>
                    <span className="text-sm text-gray-900">${disbursementsTotal.toLocaleString('en-AU')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(entry.initial_quote_total || entry.final_total_paid) && (
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Quote vs Actual</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Initial Quote</div>
                  <div className="text-lg font-bold text-gray-900">
                    {entry.initial_quote_total ? `$${entry.initial_quote_total.toLocaleString('en-AU')}` : '\u2014'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Final Paid</div>
                  <div className="text-lg font-bold text-gray-900">
                    {entry.final_total_paid ? `$${entry.final_total_paid.toLocaleString('en-AU')}` : '\u2014'}
                  </div>
                </div>
              </div>
              {entry.delta_pct !== null && (
                <div className="mt-2 text-sm text-center">
                  <span className={entry.delta_pct > 0 ? 'text-red-600' : 'text-green-600'}>
                    {entry.delta_pct > 0 ? '+' : ''}
                    {entry.delta_pct}% difference
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Context */}
        {ctxDisplayKeys.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Context</h2>
            <div className="space-y-2">
              {ctxDisplayKeys.map((key) => (
                <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-600">{getLabel(ctxSchemaProps, key)}</span>
                  <span className="text-sm font-medium text-gray-900">{formatBySchema(ctx[key], key, ctxSchemaProps?.[key])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}