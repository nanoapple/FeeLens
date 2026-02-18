// ==========================================
// Supabase 服务端客户端（App Router Server Components）
// - 仅在 Server Components / Route Handlers / Server Actions 使用
// - 通过 cookies 读写 session（如果你未来启用登录态）
// - 当前你们主要是 anon 只读，但这里用标准写法避免误用浏览器 client
// ==========================================

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createServerSupabaseClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )
}

// Explicit name per your request
export const createServerClientForAppRouter = createServerSupabaseClient
