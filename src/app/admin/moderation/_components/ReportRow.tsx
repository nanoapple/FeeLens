// src/app/admin/moderation/_components/ReportRow.tsx
//
// ── 治理设计（必读，勿简化）──────────────────────────────
//
// 主操作（直接可见）：Dismiss / Triage / Resolve
//   → 调 resolveEntryReport()
//   → 只改 entry_reports.status，不动 fee_entries 任何字段
//   → Dismiss  = 举报无效，关闭工单
//   → Triage   = 待进一步调查（仅 open 状态可用）
//   → Resolve  = 举报有效，已处理完毕
//
// 次级操作（需展开，带两步确认）：Approve / Hide / Reject entry
//   → 调 moderateEntry()，改变 fee_entries.visibility + moderation_status
//   → 加了两步确认（选择 → 确认）防止误触
//   → 用黄色警示框明确区分"这是 entry 操作"
//
// ── 为何拆开 ─────────────────────────────────────────────
//   "dismiss 无效举报"不应导致 entry 被 approve 或 hide
//   "triage 待调查"不应改变 entry 可见性
//   把工单操作和 entry 状态操作混在一起是治理误操作的主要来源
//
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveEntryReport, moderateEntry } from '@/lib/supabase/functions'
import type { ResolveReportAction } from '@/lib/supabase/types'

interface Report {
  id: string
  entry_id: string
  reporter_user_id: string
  reason_code: string
  report_text: string | null
  status: string
  created_at: string
}

interface Entry {
  id: string
  provider_id: string
  visibility: string
  moderation_status: string
  evidence_tier: string | null
  dispute_status: string | null
}

interface Provider {
  id: string
  name: string
  suburb: string | null
  postcode: string | null
  state: string | null
  status: string
}

interface ReportRowProps {
  report: Report
  entry: Entry | undefined
  provider: Provider | undefined
  openReportCount: number
}

const REASON_LABELS: Record<string, string> = {
  price_incorrect: 'Price incorrect',
  service_not_delivered: 'Service not delivered',
  duplicate: 'Duplicate',
  fraud: 'Fraud',
  expired: 'Expired',
  offensive: 'Offensive',
  other: 'Other',
}

const VISIBILITY_COLORS: Record<string, string> = {
  public: 'bg-green-100 text-green-700',
  flagged: 'bg-amber-100 text-amber-700',
  hidden: 'bg-gray-100 text-gray-600',
}

// ── 主操作配置：只动 entry_reports ──
const REPORT_ACTIONS: {
  action: ResolveReportAction
  label: string
  loadingLabel: string
  style: string
  // triage 在 DB 状态机里只允许 open → triaged（不允许 triaged → triaged）
  // UI 侧对齐：非 open 状态时禁用此按钮，避免调用后收到 409 错误
  openOnly?: boolean
}[] = [
  {
    action: 'dismiss',
    label: 'Dismiss',
    loadingLabel: 'Dismissing…',
    style: 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
  },
  {
    action: 'triage',
    label: 'Triage',
    loadingLabel: 'Triaging…',
    openOnly: true, // DB 状态机约束：只有 open 可以 triage
    style: 'rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed',
  },
  {
    action: 'resolve',
    label: 'Resolve',
    loadingLabel: 'Resolving…',
    style: 'rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed',
  },
]

export default function ReportRow({
  report,
  entry,
  provider,
  openReportCount,
}: ReportRowProps) {
  const router = useRouter()

  // 主操作状态（report-only）
  const [reportLoading, setReportLoading] = useState<ResolveReportAction | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  // note 输入：对 dismiss/resolve 尤其有用，让审计留痕
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)

  // 次级操作状态（entry 操作）
  const [showEntryActions, setShowEntryActions] = useState(false)
  const [pendingEntryAction, setPendingEntryAction] = useState<
    'approve' | 'hide' | 'reject' | null
  >(null)
  const [entryLoading, setEntryLoading] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)

  // ── 主操作：只动 entry_reports ──
  const handleReportAction = async (action: ResolveReportAction) => {
    setReportLoading(action)
    setReportError(null)
    try {
      const result = await resolveEntryReport({
        report_id: report.id,
        action,
        // note 是可选的：有填就带上，没填就不传（DB 接受 null）
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      if (!result.success) {
        setReportError(result.error ?? 'Action failed')
      } else {
        setNote('')
        setShowNote(false)
        router.refresh()
      }
    } catch {
      setReportError('Network error')
    } finally {
      setReportLoading(null)
    }
  }

  // ── 次级操作：连带改变 entry（两步确认）──
  const handleEntryAction = async () => {
    if (!entry || !pendingEntryAction) return
    setEntryLoading(true)
    setEntryError(null)
    try {
      const result = await moderateEntry({
        entry_id: entry.id,
        action: pendingEntryAction,
        reason: `Action from reports queue (report: ${report.id})`,
      })
      if (!result.success) {
        setEntryError(result.error ?? 'Action failed')
      } else {
        setPendingEntryAction(null)
        setShowEntryActions(false)
        router.refresh()
      }
    } catch {
      setEntryError('Network error')
    } finally {
      setEntryLoading(false)
    }
  }

  const createdAt = new Date(report.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <li className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* ── 左侧：举报信息 ── */}
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
            {entry && (
              <span
                className={[
                  'rounded px-1.5 py-0.5 text-xs font-medium',
                  VISIBILITY_COLORS[entry.visibility] ?? 'bg-gray-100 text-gray-600',
                ].join(' ')}
              >
                {entry.visibility}
              </span>
            )}
            {openReportCount > 1 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {openReportCount} open reports
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">
              {REASON_LABELS[report.reason_code] ?? report.reason_code}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400">{createdAt}</span>
            <span className="text-gray-400">·</span>
            <span className="font-mono text-xs text-gray-400">
              {report.entry_id.slice(0, 8)}…
            </span>
          </div>

          {report.report_text && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {report.report_text}
            </p>
          )}

          {reportError && (
            <p className="mt-1 text-xs text-red-600">{reportError}</p>
          )}
        </div>

        {/* ── 右侧：主操作（report-only）+ 次级入口 ── */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* 主操作：Dismiss / Triage / Resolve（只动 entry_reports） */}
          <div className="flex items-center gap-2">
            {REPORT_ACTIONS.map(({ action, label, loadingLabel, style, openOnly }) => {
              // triage 只对 open 状态有意义：DB 状态机会拒绝其他状态
              // UI 侧提前禁用，避免无效调用 + 困惑的报错提示
              const isTriageDisabled = openOnly && report.status !== 'open'
              const isDisabled = !!reportLoading || isTriageDisabled

              return (
                <button
                  key={action}
                  onClick={() => handleReportAction(action)}
                  disabled={isDisabled}
                  title={
                    isTriageDisabled
                      ? `Triage is only available for 'open' reports (current: ${report.status})`
                      : undefined
                  }
                  className={style}
                >
                  {reportLoading === action ? loadingLabel : label}
                </button>
              )
            })}

            {/* Note 折叠开关：轻量，不打断操作流 */}
            <button
              onClick={() => setShowNote((v) => !v)}
              title="Add an internal note (optional, stored in audit trail)"
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
            >
              {showNote ? '− note' : '+ note'}
            </button>
          </div>

          {/* Note 输入框（折叠显示）*/}
          {showNote && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Internal note (optional) — stored in entry_reports.resolution_note"
              className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-gray-500 placeholder:text-gray-400"
            />
          )}

          {/* 折叠入口：entry 操作降级为次级 */}
          {entry && (
            <button
              onClick={() => {
                setShowEntryActions((v) => !v)
                setPendingEntryAction(null)
                setEntryError(null)
              }}
              className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
            >
              {showEntryActions ? 'Hide entry actions ↑' : 'Also act on entry ↓'}
            </button>
          )}
        </div>
      </div>

      {/* ── 次级区域：entry 操作（展开后才可见，带两步确认）── */}
      {showEntryActions && entry && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-800">
            ⚠ These actions change the <strong>entry&apos;s</strong> visibility — separate
            from resolving this report. Use only if the entry itself needs action.
          </p>

          {/* Step 1：选择 entry 动作 */}
          {!pendingEntryAction && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPendingEntryAction('approve')}
                className="rounded border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
              >
                Approve entry (make public)
              </button>
              <button
                onClick={() => setPendingEntryAction('hide')}
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Hide entry
              </button>
              <button
                onClick={() => setPendingEntryAction('reject')}
                className="rounded border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Reject entry
              </button>
            </div>
          )}

          {/* Step 2：确认框 */}
          {pendingEntryAction && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-800">
                Confirm: <strong>{pendingEntryAction}</strong> entry{' '}
                <span className="font-mono">{entry.id.slice(0, 8)}…</span>?
              </span>
              <button
                onClick={handleEntryAction}
                disabled={entryLoading}
                className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {entryLoading ? 'Working…' : 'Confirm'}
              </button>
              <button
                onClick={() => setPendingEntryAction(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}

          {entryError && (
            <p className="mt-1 text-xs text-red-600">{entryError}</p>
          )}
        </div>
      )}
    </li>
  )
}
