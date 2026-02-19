// src/lib/supabase/client.ts
// ==========================================
// Supabase Browser Client — Canonical Entry Point
//
// Auth-2: Unified import path for browser-side Supabase client.
//
// Usage in Client Components:
//   import { createClient } from '@/lib/supabase/client'
//
// This re-exports everything from client.browser.ts so existing
// imports from either path continue to work. New code should
// import from this file.
//
// Rules (from FeeLens Universal Instruction §A):
//   - anon key only, no service_role
//   - SELECT only — all writes via Edge Functions (see functions.ts)
// ==========================================

export {
  createBrowserSupabaseClient,
  createBrowserSupabaseClient as createClient,
  getCurrentUser,
  isAuthenticated,
  checkUserRole,
} from './client.browser'
