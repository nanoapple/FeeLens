 // ==========================================
// Supabase 客户端（只读 + Edge Functions）
// ==========================================

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * 创建 Supabase 浏览器客户端
 * 注意：此客户端使用 anon key，RLS 限制为只读
 * 所有写入操作必须通过 Edge Functions
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUser() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    console.error('获取用户失败:', error)
    return null
  }
  
  return user
}

/**
 * 检查用户是否已登录
 */
export async function isAuthenticated() {
  const user = await getCurrentUser()
  return user !== null
}

/**
 * 检查用户是否是管理员/审核员
 */
export async function checkUserRole(role: 'admin' | 'moderator') {
  const supabase = createClient()
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

