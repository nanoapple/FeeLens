// src/app/admin/disputes/page.tsx
// ==========================================
// Disputes Admin — Server Component
//
// 数据合约：
//   真相源：disputes.status = 'pending'
//   join：fee_entries (visibility, moderation_status, dispute_status, evidence_tier)
//         providers (name, status)
//
// 不变量：
//   disputes.status='pending' → fee_entries.dispute_status='pending'
//   resolve_dispute 成功后：fee_entries.dispute_status='resolved'
// ==========================================

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import DisputeRow from './_components/DisputeRow'

export default async function DisputesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Disputes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Provider-submitted disputes against fee entries
        </p>
      </div>
      <Suspense fallback={<LoadingRows />}>
        <DisputesList />
      </Suspense>
    </div>
  )
}

async function DisputesList() {
  const supabase = createServerSupabaseClient()

  const { data: disputes, error } = await supabase
    .from('disputes')
    .select(`
      id,
      entry_id,
      provider_verification_method,
      provider_contact,
      provider_claim,
      status,
      created_at
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load disputes: {error.message}
      </div>
    )
  }

  if (!disputes || disputes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-500">No pending disputes ✓</p>
      </div>
    )
  }

  // 关联 entry + provider
  const entryIds = [...new Set(disputes.map((d) => d.entry_id))]
  const { data: entries } = await supabase
    .from('fee_entries')
    .select('id, provider_id, visibility, moderation_status, dispute_status, evidence_tier')
    .in('id', entryIds)

  const providerIds = [...new Set((entries ?? []).map((e) => e.provider_id).filter(Boolean))]
  const { data: providers } = await supabase
    .from('providers')
    .select('id, name, status')
    .in('id', providerIds)

  const entryMap = Object.fromEntries((entries ?? []).map((e) => [e.id, e]))
  const providerMap = Object.fromEntries((providers ?? []).map((p) => [p.id, p]))

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-3">
        <p className="text-sm text-gray-500">
          {disputes.length} pending {disputes.length === 1 ? 'dispute' : 'disputes'}
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {disputes.map((dispute) => {
          const entry = entryMap[dispute.entry_id]
          const provider = entry ? providerMap[entry.provider_id] : undefined
          return (
            <DisputeRow
              key={dispute.id}
              dispute={dispute}
              entry={entry}
              provider={provider}
            />
          )
        })}
      </ul>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  )
}
