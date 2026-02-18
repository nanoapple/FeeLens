// src/app/admin/moderation/page.tsx
// ==========================================
// Admin Moderation — 3-Tab 页面
//
// Tab 1: Reports    — entry_reports.status IN ('open','triaged')
// Tab 2: Entries    — fee_entries.moderation_status IN ('unreviewed','flagged')
// Tab 3: Providers  — providers.status IN ('pending','suspended')
//
// 这是 Server Component：数据在服务端 SELECT，动作走 Client 组件。
// ==========================================

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import ReportsList from './_components/ReportsList'
import EntriesQueue from './_components/EntriesQueue'
import ProvidersQueue from './_components/ProvidersQueue'
import TabNav from './_components/TabNav'

// 允许的 tab 值
type TabKey = 'reports' | 'entries' | 'providers'

interface PageProps {
  searchParams: { tab?: string }
}

export default async function ModerationPage({ searchParams }: PageProps) {
  const tab = (searchParams.tab ?? 'reports') as TabKey
  const supabase = createServerSupabaseClient()

  // ——— 并发取三个队列的数量（仅用于 badge 展示）———
  const [reportsCount, entriesCount, providersCount] = await Promise.all([
    supabase
      .from('entry_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'triaged'])
      .then(({ count }) => count ?? 0),

    supabase
      .from('fee_entries')
      .select('id', { count: 'exact', head: true })
      .in('moderation_status', ['unreviewed', 'flagged'])
      .then(({ count }) => count ?? 0),

    supabase
      .from('providers')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'suspended'])
      .then(({ count }) => count ?? 0),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Moderation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review reports, entries, and provider submissions
        </p>
      </div>

      <TabNav
        active={tab}
        counts={{ reports: reportsCount, entries: entriesCount, providers: providersCount }}
      />

      <div className="mt-6">
        <Suspense fallback={<LoadingRows />}>
          {tab === 'reports' && <ReportsList />}
          {tab === 'entries' && <EntriesQueue />}
          {tab === 'providers' && <ProvidersQueue />}
        </Suspense>
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  )
}
