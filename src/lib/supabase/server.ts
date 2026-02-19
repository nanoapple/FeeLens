// src/lib/supabase/server.ts
// ==========================================
// Supabase Server Client — Canonical Entry Point
//
// Auth-2: Unified import path for server-side Supabase client.
//
// Usage in Server Components / Route Handlers / Server Actions:
//   import { createServerSupabaseClient } from '@/lib/supabase/server'
//
// This re-exports everything from client.server.ts so existing
// imports from either path continue to work. New code should
// import from this file.
//
// How it works:
//   - Reads Supabase auth cookies from Next.js cookies()
//   - Returns a typed Supabase client with the user's session
//   - Uses anon key (session comes from cookie, not service_role)
// ==========================================

export {
  createServerSupabaseClient,
  createServerClientForAppRouter,
} from './client.server'
