// src/app/admin/disputes/_components/DisputeRow.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveDispute } from '@/lib/supabase/functions'

type Outcome = 'maintained' | 'corrected' | 'removed' | 'partial_hidden'

interface DisputeRowProps {
  dispute: {
    id: string
    entry_id: string
    provider_verification_method: string | null
    provider_contact: string | null
    provider_claim: string | null
    status: string
    created_at: string
  }
  entry:
    | {
        id: string
        provider_id: string
        visibility: string
        moderation_status: string
        dispute_status: string | null
        evidence_tier: string | null
      }
    | undefined
  provider: { id: string; name: string; status: string } | undefined
}

const OUTCOME_OPTIONS: { value: Outcome; label: string; description: string }[] = [
  {
    value: 'maintained',
    label: 'Maintain',
    description: 'Entry is accurate — no changes',
  },
  {
    value: 'corrected',
    label: 'Correct',
    description: 'Mark evidence as corrected (Tier C)',
  },
  {
    value: 'partial_hidden',
    label: 'Partial hide',
    description: 'Flag entry for further review',
  },
  {
    value: 'removed',
    label: 'Remove',
    description: 'Hide entry entirely',
  },
]

const OUTCOME_COLORS: Record<Outcome, string> = {
  maintained: 'border-green-300 bg-green-50 text-green-800',
  corrected: 'border-blue-300 bg-blue-50 text-blue-800',
  partial_hidden: 'border-amber-300 bg-amber-50 text-amber-800',
  removed: 'border-red-300 bg-red-50 text-red-800',
}

export default function DisputeRow({ dispute, entry, provider }: DisputeRowProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('maintained')
  const [platformResponse, setPlatformResponse] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResolve = async () => {
    if (!platformResponse.trim()) {
      setError('Platform response is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await resolveDispute({
        dispute_id: dispute.id,
        outcome: selectedOutcome,
        platform_response: platformResponse.trim(),
        resolution_note: resolutionNote.trim() || undefined,
      })

      if (!result.success) {
        setError(result.error ?? 'Failed to resolve dispute')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const createdAt = new Date(dispute.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <li className="px-6 py-5">
      {/* Summary row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">
              {provider?.name ?? 'Unknown provider'}
            </span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
              disputed
            </span>
            {entry?.evidence_tier && (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
                Tier {entry.evidence_tier}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            {dispute.provider_claim && (
              <span className="line-clamp-1">{dispute.provider_claim}</span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>{createdAt}</span>
            <span>·</span>
            <span className="font-mono">{dispute.id.slice(0, 8)}…</span>
            {dispute.provider_verification_method && (
              <>
                <span>·</span>
                <span>via {dispute.provider_verification_method}</span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          {expanded ? 'Collapse' : 'Resolve'}
        </button>
      </div>

      {/* Expanded resolution form */}
      {expanded && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {/* Outcome selector */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-gray-700 uppercase tracking-wide">
              Outcome
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {OUTCOME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedOutcome(opt.value)}
                  className={[
                    'rounded-md border p-2 text-left text-xs transition',
                    selectedOutcome === opt.value
                      ? OUTCOME_COLORS[opt.value]
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  ].join(' ')}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-xs opacity-75">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Platform response (required) */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Platform response <span className="text-red-500">*</span>
            </label>
            <textarea
              value={platformResponse}
              onChange={(e) => setPlatformResponse(e.target.value)}
              rows={2}
              placeholder="Response to the provider explaining the decision…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>

          {/* Resolution note (optional) */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Internal note{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={2}
              placeholder="Internal notes for audit trail…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>

          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setExpanded(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleResolve}
              disabled={loading}
              className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Resolving…' : `Resolve as ${selectedOutcome}`}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
