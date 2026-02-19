// src/app/auth/callback/route.ts
// ==========================================
// Auth Callback Route Handler
//
// Handles:
//   1. Magic Link email redirects (Supabase sends ?code=xxx)
//   2. OAuth callbacks (future-proofing)
//
// Flow:
//   User clicks magic link → Supabase redirects to /auth/callback?code=xxx
//   This handler exchanges the code for a session cookie,
//   then redirects to the `next` param (or /).
//
// Security:
//   - `next` param validated as relative path
//   - Code exchange happens server-side via @supabase/ssr
//
// ⚠️ REQUIRED CONFIG (or magic link will silently fail):
//   Supabase Dashboard → Authentication → URL Configuration:
//     Site URL:       http://localhost:3000  (or your dev port)
//     Redirect URLs:  http://localhost:3000/auth/callback
//   For local dev with `supabase start`:
//     Edit supabase/config.toml:
//       [auth]
//       site_url = "http://localhost:3000"
//       additional_redirect_urls = ["http://localhost:3000/auth/callback"]
// ==========================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Validate `next` is a safe relative path
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') && !next.includes('://')
      ? next
      : '/'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // If code exchange fails or no code, redirect to login with error hint
  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed&callbackUrl=${encodeURIComponent(safeNext)}`
  )
}
