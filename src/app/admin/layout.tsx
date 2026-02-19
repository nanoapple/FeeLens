// src/app/admin/layout.tsx
// ==========================================
// Admin Layout — RBAC Guard (Layer 2)
//
// Auth-2/3: Two-layer defense:
//   Layer 1: middleware.ts — rejects unauthenticated requests (fast)
//   Layer 2: THIS LAYOUT — verifies role via DB RPC (authoritative)
//
// Flow:
//   1. getUser() — verify session is valid (not just cookie exists)
//      If invalid → /login?callbackUrl=<current-path>&error=session_expired
//   2. is_moderator_or_admin() RPC — verify role in DB
//      If no role → / (don't expose admin routes exist)
//   3. Pass → render admin shell + children
//
// Role check uses rpcBoolean() from rpc-helpers.ts:
//   - Centralized typed wrapper (no `as any`)
//   - Strict `data === true` check
//   - Logs RPC errors for debugging
//
// All /admin/* pages inherit this guard automatically.
// ==========================================

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { rpcBoolean } from '@/lib/supabase/rpc-helpers'

export const metadata = {
  title: 'FeeLens Admin',
  robots: { index: false, follow: false },
}

/**
 * Get the current admin URL path from request headers.
 *
 * Priority:
 *   1. `x-url` — injected by our middleware.ts (most reliable)
 *   2. `x-invoke-path` — set by Next.js internally (no query string)
 *   3. `referer` — browser-sent (may be missing/truncated)
 *   4. Default: /admin/moderation
 */
function getCurrentAdminPath(): string {
  const headerStore = headers()

  // Best source: injected by middleware (includes pathname + search)
  const xUrl = headerStore.get('x-url')
  if (xUrl?.startsWith('/admin')) {
    return xUrl
  }

  // Fallback: Next.js internal header (no query string guarantee)
  const invokePath = headerStore.get('x-invoke-path')
  if (invokePath?.startsWith('/admin')) {
    return invokePath
  }

  // Last resort: browser referer
  const referer = headerStore.get('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      if (url.pathname.startsWith('/admin')) {
        return url.pathname + url.search
      }
    } catch {
      // Invalid referer URL, ignore
    }
  }

  return '/admin/moderation'
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabaseClient()

  // 1. Verify session is valid
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    const callbackPath = getCurrentAdminPath()
    redirect(
      `/login?callbackUrl=${encodeURIComponent(callbackPath)}&error=session_expired`
    )
  }

  // 2. Verify role — DB is the source of truth
  // rpcBoolean() handles typing + error logging + strict boolean check
  const hasRole = await rpcBoolean(supabase, 'is_moderator_or_admin')

  if (!hasRole) {
    // No permission: redirect to home (don't reveal admin routes exist)
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin top navigation bar */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-semibold text-gray-900 hover:text-gray-700 transition"
            >
              FeeLens
            </Link>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Admin
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/admin/moderation"
              className="text-gray-600 transition hover:text-gray-900"
            >
              Moderation
            </Link>
            <Link
              href="/admin/disputes"
              className="text-gray-600 transition hover:text-gray-900"
            >
              Disputes
            </Link>
            <span className="text-xs text-gray-400">{user.email}</span>
          </nav>
        </div>
      </header>

      {/* Main content area */}
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
