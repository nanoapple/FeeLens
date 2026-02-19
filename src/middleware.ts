// src/middleware.ts
// ==========================================
// Auth-2: Unified Route Guard (Next.js Middleware)
//
// Strategy (two-layer defense):
//   Layer 1 — THIS MIDDLEWARE (fast, runs on Edge):
//     Checks if a Supabase auth session cookie exists.
//     If not → redirect to /login?callbackUrl=...
//     This catches 100% of unauthenticated /admin/* requests
//     before they even hit the Server Component tree.
//
//   Layer 2 — admin/layout.tsx (Server Component, runs on Node):
//     Calls is_moderator_or_admin() RPC to verify role.
//     If no role → redirect to / (don't expose admin routes)
//     This is the authoritative RBAC check.
//
// Cookie detection:
//   @supabase/ssr stores auth in cookies matching the pattern:
//     sb-<project-ref>-auth-token        (single cookie)
//     sb-<project-ref>-auth-token.0/.1   (chunked for large JWTs)
//   We use a strict regex to avoid false positives from unrelated cookies.
//   Expired/invalid tokens will pass middleware but fail in layout's
//   getUser() call — this is correct (layout handles redirect with context).
//
// Matched routes:
//   /admin, /admin/* — excluding /_next/*, static files
// ==========================================

import { NextResponse, type NextRequest } from 'next/server'

/**
 * Strict regex for Supabase auth cookie names.
 *
 * Matches:
 *   sb-localhost-auth-token
 *   sb-abcdefghijklmnop-auth-token
 *   sb-abcdefghijklmnop-auth-token.0
 *   sb-abcdefghijklmnop-auth-token.1
 *
 * Does NOT match:
 *   my-custom-auth-token
 *   x-auth-token-legacy
 *   sb-ref-other-token
 */
const SUPABASE_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/

/**
 * Check if a valid Supabase auth session cookie exists.
 */
function hasSupabaseSession(request: NextRequest): boolean {
  const cookies = request.cookies.getAll()
  return cookies.some(
    (c) => SUPABASE_COOKIE_RE.test(c.name) && c.value.length > 0
  )
}

export function middleware(request: NextRequest) {
  // ── /admin/* guard ──
  if (!hasSupabaseSession(request)) {
    const loginUrl = new URL('/login', request.url)
    // Preserve full path + query string so user returns to exact page
    // e.g. /admin/moderation?tab=pending → callbackUrl=/admin/moderation?tab=pending
    const callbackPath =
      request.nextUrl.pathname + request.nextUrl.search
    loginUrl.searchParams.set('callbackUrl', callbackPath)
    return NextResponse.redirect(loginUrl)
  }

  // Session cookie exists: pass through to layout for RBAC check.
  // Inject x-url into REQUEST headers so admin/layout.tsx's headers()
  // can reliably determine the current path for callbackUrl.
  // (response.headers.set would only send to browser, not to Server Components)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(
    'x-url',
    request.nextUrl.pathname + request.nextUrl.search
  )

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  // Match /admin and /admin/* but skip:
  //   - /_next/*           (Next.js internals, static chunks)
  //   - Files with extensions (favicon.ico, *.css, *.js, *.png etc.)
  //
  // Using Next.js recommended middleware matcher pattern:
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: [
    '/admin',
    '/admin/((?!_next/|.*\\..*).*)',
  ],
}
