// src/app/admin/layout.tsx
// ==========================================
// Admin 权限门 — Server Component
//
// 职责：
//   - 用 createServerSupabaseClient() 读取当前 session
//   - 调 is_moderator_or_admin() RPC 验证角色
//   - 未登录 → redirect('/login')
//   - 无权限 → redirect('/')（或 notFound()，视产品决策）
//   - 通过 → 渲染 children + Admin 通用 shell
//
// 注意：
//   - 所有 /admin/* 页面不需要再重复写权限逻辑
//   - RPC is_moderator_or_admin() 在 DB 层 SECURITY DEFINER，可信
// ==========================================

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'

export const metadata = {
  title: 'FeeLens Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabaseClient()

  // 1. 验证登录态
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // 2. 验证角色（调 DB 函数，SECURITY DEFINER 可信）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hasRole, error: roleError } = await (supabase.rpc as any)(
    'is_moderator_or_admin'
  )

  if (roleError || !hasRole) {
    // 无权限：回首页（不暴露 admin 路由是否存在）
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin 顶部导航栏 */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">FeeLens</span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Admin
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm">
            <a
              href="/admin/moderation"
              className="text-gray-600 transition hover:text-gray-900"
            >
              Moderation
            </a>
            <a
              href="/admin/disputes"
              className="text-gray-600 transition hover:text-gray-900"
            >
              Disputes
            </a>
            <span className="text-xs text-gray-400">{user.email}</span>
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
