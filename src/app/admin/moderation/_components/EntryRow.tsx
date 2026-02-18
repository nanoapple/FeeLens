// src/app/admin/moderation/_components/EntryRow.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moderateEntry } from '@/lib/supabase/functions'

interface EntryRowProps {
  entry: {
    id: string
    provider_id: string
    visibility: string
    moderation_status: string
    evidence_tier: string | null
    dispute_status: string | null
    created_at: string
  }
  provider: { id: string; name: string; suburb: string | null; state: string | null } | undefined
}

const MOD_STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-blue-50 text-blue-700',
  flagged:    'bg-amber-100 text-amber-700',
  approved:   'bg-green-100 text-green-700',
  rejected:   'bg-gray-100 text-gray-500',
}

export default function EntryRow({ entry, provider }: EntryRowProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action)
    setError(null)
    try {
      const result = await moderateEntry({
        entry_id: entry.id,
        action,
        // 强制写入 reason（与 ReportRow 一致）：
        //   moderate_entry() RPC 把 reason 写进 moderation_actions.reason。
        //   缺失 reason 导致审计日志里看不出"为什么改状态"。
        reason: `Admin action via entries queue: ${action}`,
      })
      if (!result.success) {
        setError(result.error ?? 'Action failed')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  const createdAt = new Date(entry.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <li className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">
            {provider?.name ?? 'Unknown provider'}
          </span>
          {provider && (
            <span className="text-sm text-gray-400">
              {[provider.suburb, provider.state].filter(Boolean).join(', ')}
            </span>
          )}
          <span
            className={[
              'rounded px-1.5 py-0.5 text-xs font-medium',
              MOD_STATUS_COLORS[entry.moderation_status] ?? 'bg-gray-100 text-gray-600',
            ].join(' ')}
          >
            {entry.moderation_status}
          </span>
          {entry.evidence_tier && (
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
              Tier {entry.evidence_tier}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <span>{createdAt}</span>
          <span>·</span>
          <span className="font-mono">{entry.id.slice(0, 8)}…</span>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => handleAction('approve')}
          disabled={!!loading}
          className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
        >
          {loading === 'approve' ? '…' : 'Approve'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={!!loading}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
        >
          {loading === 'reject' ? '…' : 'Reject'}
        </button>
      </div>
    </li>
  )
}
