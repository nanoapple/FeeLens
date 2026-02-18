// src/app/admin/moderation/_components/ProviderRow.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveProvider } from '@/lib/supabase/functions'

// ── DB 合约确认 ───────────────────────────────────────────────────────
// approve_provider(p_provider_id, p_action, p_reason)
// p_action: 'approve' | 'reject'   ← migration 20260218000003
// 权限：is_admin()（不含 moderator）
//
// ProvidersQueue 通过 is_admin() RPC 判断后，把 canApprove 传入。
// moderator 进入此页会看到 "Admin only" 提示，不会看到可点击后失败的按钮。
// ─────────────────────────────────────────────────────────────────────

// 当前 approve_provider() 只写 'approve' | 'reject'，
// 其他 action（suspend/unsuspend/update_info）是预留字段，暂不出现在审计记录里。
// 如将来扩展，在这里同步补充。
const ACTION_LABELS: Record<string, string> = {
  approve: 'Approved',
  reject:  'Rejected',
}

interface LastAction {
  action: string
  old_status: string | null
  new_status: string | null
  reason: string | null
  created_at: string
}

interface ProviderRowProps {
  provider: {
    id: string
    name: string
    slug: string
    state: string | null
    postcode: string | null
    suburb: string | null
    status: string
    status_changed_at: string | null
    status_reason: string | null
    industry_tags: string[] | null
    provider_type: string | null
  }
  lastAction: LastAction | null
  // approve_provider() 只允许 admin（不含 moderator）。
  // 由 ProvidersQueue（Server Component）判断 is_admin() 后传入。
  canApprove: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-blue-50 text-blue-700',
  suspended: 'bg-red-100 text-red-700',
}

export default function ProviderRow({ provider, lastAction, canApprove }: ProviderRowProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action)
    setError(null)
    try {
      const result = await approveProvider({
        provider_id: provider.id,
        action,
        reason: `Admin action via providers queue: ${action}`,
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

  const changedAt = provider.status_changed_at
    ? new Date(provider.status_changed_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
      })
    : null

  const lastActionAt = lastAction
    ? new Date(lastAction.created_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      })
    : null

  return (
    <li className="flex items-start justify-between gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        {/* ── 名称 + 状态 badge + industry tags ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">{provider.name}</span>
          <span
            className={[
              'rounded px-1.5 py-0.5 text-xs font-medium',
              STATUS_COLORS[provider.status] ?? 'bg-gray-100 text-gray-600',
            ].join(' ')}
          >
            {provider.status}
          </span>
          {provider.industry_tags?.map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* ── 地理 + 最后状态变更时间 ── */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <span>
            {[provider.suburb, provider.postcode, provider.state]
              .filter(Boolean)
              .join(', ')}
          </span>
          {changedAt && (
            <>
              <span>·</span>
              <span>Status changed {changedAt}</span>
            </>
          )}
        </div>

        {/* ── status_reason（provider 主表字段）── */}
        {provider.status_reason && (
          <p className="mt-1 text-xs text-gray-500">{provider.status_reason}</p>
        )}

        {/* ── 最近一条 provider_actions 审计摘要 ── */}
        {lastAction && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
            <span className="font-medium text-gray-500">Last action:</span>
            <span>{ACTION_LABELS[lastAction.action] ?? lastAction.action}</span>
            {lastAction.old_status && lastAction.new_status && (
              <span className="font-mono">
                {lastAction.old_status} → {lastAction.new_status}
              </span>
            )}
            {lastActionAt && <span>on {lastActionAt}</span>}
            {lastAction.reason && lastAction.reason !== 'No reason provided' && (
              <>
                <span>·</span>
                <span className="italic">{lastAction.reason}</span>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      {/* ── 操作区：admin 显示按钮，moderator 显示 "Admin only" ── */}
      <div className="flex shrink-0 items-center gap-2">
        {canApprove ? (
          <>
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
          </>
        ) : (
          // moderator 可查看队列但无法操作；明确提示避免困惑
          <span
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-400"
            title="Provider approval requires admin role. Contact an admin to action this."
          >
            Admin only
          </span>
        )}
      </div>
    </li>
  )
}
