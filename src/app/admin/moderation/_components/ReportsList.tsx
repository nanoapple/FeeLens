// src/app/admin/moderation/_components/ReportsList.tsx
// ==========================================
// Reports 队列 — Server Component
//
// 数据合约：
//   真相源：entry_reports.status IN ('open','triaged')
//   join：fee_entries (provider_id, visibility, moderation_status)
//         providers (name, suburb, postcode, state)
//
// 动作（MVP 档）：
//   Approve → moderateEntry(entry_id, 'approve', note)
//             效果：entry public + reports → resolved
//   Hide    → moderateEntry(entry_id, 'hide', note)
//             效果：entry hidden + reports 不变
//   Reject  → moderateEntry(entry_id, 'reject', note)
//             效果：entry hidden + reports 不变
// ==========================================

import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import ReportRow from './ReportRow'

export default async function ReportsList() {
  const supabase = createServerSupabaseClient()

  // 取 open/triaged reports，最多 50 条
  // Supabase 不支持 join 语法，用两步查询
  const { data: reports, error } = await supabase
    .from('entry_reports')
    .select(`
      id,
      entry_id,
      reporter_user_id,
      reason_code,
      report_text,
      status,
      created_at
    `)
    .in('status', ['open', 'triaged'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load reports: {error.message}
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-500">No open reports — queue is clear ✓</p>
      </div>
    )
  }

  // 批量取关联 entry + provider 信息
  const entryIds = [...new Set(reports.map((r) => r.entry_id))]

  const { data: entries } = await supabase
    .from('fee_entries')
    .select('id, provider_id, visibility, moderation_status, evidence_tier, dispute_status')
    .in('id', entryIds)

  const providerIds = [...new Set((entries ?? []).map((e) => e.provider_id).filter(Boolean))]

  const { data: providers } = await supabase
    .from('providers')
    .select('id, name, suburb, postcode, state, status')
    .in('id', providerIds)

  // 构建查找 map
  const entryMap = Object.fromEntries((entries ?? []).map((e) => [e.id, e]))
  const providerMap = Object.fromEntries((providers ?? []).map((p) => [p.id, p]))

  // 按 entry_id 聚合：同一 entry 的 open report 数量
  const reportCountByEntry: Record<string, number> = {}
  for (const r of reports) {
    reportCountByEntry[r.entry_id] = (reportCountByEntry[r.entry_id] ?? 0) + 1
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-3">
        <p className="text-sm text-gray-500">
          {reports.length} open {reports.length === 1 ? 'report' : 'reports'}
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {reports.map((report) => {
          const entry = entryMap[report.entry_id]
          const provider = entry ? providerMap[entry.provider_id] : undefined
          const openCount = reportCountByEntry[report.entry_id] ?? 1

          return (
            <ReportRow
              key={report.id}
              report={report}
              entry={entry}
              provider={provider}
              openReportCount={openCount}
            />
          )
        })}
      </ul>
    </div>
  )
}
