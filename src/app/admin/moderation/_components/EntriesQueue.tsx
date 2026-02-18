// src/app/admin/moderation/_components/EntriesQueue.tsx
// ==========================================
// Entries 审核队列 — Server Component
//
// 数据合约：
//   fee_entries.moderation_status IN ('unreviewed','flagged')
//   join providers (name, suburb, state)
// ==========================================

import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import EntryRow from './EntryRow'

export default async function EntriesQueue() {
  const supabase = createServerSupabaseClient()

  const { data: entries, error } = await supabase
    .from('fee_entries')
    .select('id, provider_id, visibility, moderation_status, evidence_tier, created_at, dispute_status')
    .in('moderation_status', ['unreviewed', 'flagged'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load entries: {error.message}
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-500">No entries pending review ✓</p>
      </div>
    )
  }

  const providerIds = [...new Set(entries.map((e) => e.provider_id).filter(Boolean))]
  const { data: providers } = await supabase
    .from('providers')
    .select('id, name, suburb, state')
    .in('id', providerIds)

  const providerMap = Object.fromEntries((providers ?? []).map((p) => [p.id, p]))

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-3">
        <p className="text-sm text-gray-500">{entries.length} entries pending review</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            provider={providerMap[entry.provider_id]}
          />
        ))}
      </ul>
    </div>
  )
}
