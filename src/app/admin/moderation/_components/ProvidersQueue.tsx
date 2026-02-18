// src/app/admin/moderation/_components/ProvidersQueue.tsx
// ==========================================
// Providers 审核队列 — Server Component
//
// 数据合约：
//   providers.status IN ('pending','suspended')
//   + provider_actions 最近 1 条审计记录（展示 last action + reason）
//
// 权限说明：
//   页面通过 admin/layout.tsx 的 is_moderator_or_admin() 守门，
//   但 approve_provider() RPC 只允许 is_admin()（不含 moderator）。
//   因此 ProvidersQueue 需要额外判断 is_admin() 并把结果传给 ProviderRow，
//   让 moderator 看到"Admin only"而非可点击后失败的按钮。
// ==========================================

import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import ProviderRow from './ProviderRow'

export default async function ProvidersQueue() {
  const supabase = createServerSupabaseClient()

  // ── 权限检查：区分 admin vs moderator ──
  // layout 已确保当前用户是 moderator_or_admin，这里只需判断是否有更高的 admin 权限
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: isAdmin } = await (supabase.rpc as any)('is_admin')
  // is_admin() RETURNS BOOLEAN，同 is_moderator_or_admin() 的合约
  const canApprove = isAdmin === true

  // Step 1: 取需要审核的 providers
  const { data: providers, error: providersError } = await supabase
    .from('providers')
    .select(`
      id,
      name,
      slug,
      state,
      postcode,
      suburb,
      status,
      status_changed_at,
      status_reason,
      industry_tags,
      provider_type
    `)
    .in('status', ['pending', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (providersError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load providers: {providersError.message}
      </div>
    )
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-500">No providers pending review ✓</p>
      </div>
    )
  }

  // Step 2: 取这批 providers 的最新一条 provider_actions 记录
  //
  // limit 说明：
  //   50 providers（Step 1 上限）× 每 provider 约 10 条历史 = ~500 条上限。
  //   results 按 created_at DESC，内存归约时首次出现即为最新，后续跳过。
  //   超出 500 说明某 provider 有异常高的 action 历史，届时需重新评估。
  //
  // 错误处理：
  //   actionsError 不阻止 providers 列表渲染，但必须给 Admin 可见提示。
  //   静默失败会让 Admin 误以为"没有审计记录"，这是误导性展示。
  const providerIds = providers.map((p) => p.id)

  const { data: allActions, error: actionsError } = await supabase
    .from('provider_actions')
    .select('provider_id, action, old_status, new_status, reason, created_at')
    .in('provider_id', providerIds)
    .order('created_at', { ascending: false })
    .limit(500)

  if (actionsError) {
    console.error('[ProvidersQueue] provider_actions load failed:', actionsError.message)
  }

  // 内存归约：每个 provider 只保留最新一条（首次出现即为最新）
  const latestActionMap = new Map<
    string,
    {
      action: string
      old_status: string | null
      new_status: string | null
      reason: string | null
      created_at: string
    }
  >()
  for (const action of allActions ?? []) {
    if (!latestActionMap.has(action.provider_id)) {
      latestActionMap.set(action.provider_id, action)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-3">
        <p className="text-sm text-gray-500">{providers.length} providers pending review</p>
      </div>

      {/* 审计查询失败时显示 banner，防止 Admin 误读"无审计记录" */}
      {actionsError && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-700">
          ⚠ Audit history unavailable — could not load provider_actions (
          {actionsError.message}). Provider list is shown but Last Action column will be
          empty.
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            lastAction={latestActionMap.get(provider.id) ?? null}
            canApprove={canApprove}
          />
        ))}
      </ul>
    </div>
  )
}
