// ==========================================
// Supabase 浏览器客户端（只读 + Edge Functions）
// - 仅在 Client Components / 浏览器环境使用
// - 使用 anon key，RLS 限制为只读
// - 所有写入必须通过 Edge Functions / RPC（封装在 functions.ts）
// ==========================================

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Back-compat alias (你现有代码大量使用 createClient)
export const createClient = createBrowserSupabaseClient

/**
 * 获取当前登录用户（浏览器）
 */
export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('获取用户失败:', error)
    return null
  }

  return user
}

/**
 * 检查用户是否已登录（浏览器）
 */
export async function isAuthenticated() {
  const user = await getCurrentUser()
  return user !== null
}

/**
 * 检查用户是否是管理员/审核员（浏览器）
 */
export async function checkUserRole(role: 'admin' | 'moderator') {
  const supabase = createBrowserSupabaseClient()
  const user = await getCurrentUser()

  if (!user) return false

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', role)
    .single()

  return !error && data !== null
}
