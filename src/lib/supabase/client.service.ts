// src/lib/supabase/client.service.ts
// ==========================================
// Supabase Service Role Client — SERVER-ONLY
//
// ⚠️  DANGER: This client bypasses RLS entirely.
// ⚠️  NEVER import this in client components or browser code.
// ⚠️  NEVER expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
//
// Usage: ONLY in API route handlers (/api/*) that need
// to read aggregated data without user session context.
//
// Current usage:
//   /api/home — reads stats + recent reports for public homepage
//
// The key comes from SUPABASE_SERVICE_ROLE_KEY (non-NEXT_PUBLIC_).
// This env var is only available server-side by Next.js convention.
// ==========================================

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Create a Supabase client with service_role key.
 * Bypasses RLS — use with extreme care.
 * Only call from API routes / server-only code.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. ' +
      'Ensure these are set in .env.local (service key must NOT be NEXT_PUBLIC_).'
    )
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
