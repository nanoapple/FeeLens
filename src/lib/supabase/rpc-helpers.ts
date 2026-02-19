// src/lib/supabase/rpc-helpers.ts
// ==========================================
// Typed RPC Helpers
//
// Auth-3: Centralized typed wrappers for Supabase RPC calls.
//
// Problem:
//   Supabase's generated Database types often don't include
//   custom SECURITY DEFINER functions (has_role, is_admin, etc.).
//   This forces `supabase.rpc as any` casts scattered across
//   the codebase, defeating TypeScript's safety.
//
// Solution:
//   Small typed wrappers that contain the cast in ONE place.
//   All callers get clean, type-safe APIs.
//
// Usage:
//   import { rpcBoolean, rpcJsonb } from '@/lib/supabase/rpc-helpers'
//
//   const isAdmin = await rpcBoolean(supabase, 'is_admin')
//   const result  = await rpcJsonb<{ entry_id: string }>(supabase, 'create_fee_entry_v2', params)
//   if (result.ok) console.log(result.data.entry_id)
//   else console.error(result.error)
// ==========================================

import type { SupabaseClient as OfficialSupabaseClient } from '@supabase/supabase-js'

// Use official type when available, but accept any object with an rpc method.
// This allows both server and browser clients to be passed in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = OfficialSupabaseClient<any, any, any>

// ==========================================
// Result type for rpcJsonb — explicit union, no ambiguity
// ==========================================
export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ==========================================
// Internal: the actual rpc() call with type bridge
// ==========================================
async function callRpc(
  supabase: AnySupabaseClient,
  fnName: string,
  params?: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (params) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase.rpc as any)(fnName, params)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.rpc as any)(fnName)
}

// ==========================================
// rpcBoolean — for parameterless boolean RPCs
// ==========================================
/**
 * Call a Supabase RPC function that returns a bare boolean.
 *
 * Covers: is_admin(), is_moderator_or_admin()
 *
 * Returns false on any error (network, permission, etc.)
 * so callers can safely use it in conditionals.
 */
export async function rpcBoolean(
  supabase: AnySupabaseClient,
  fnName: string
): Promise<boolean> {
  try {
    const { data, error } = await callRpc(supabase, fnName)

    if (error) {
      console.error(`RPC ${fnName} error:`, error.message)
      return false
    }

    // Strict: only `true` passes, not truthy values
    return data === true
  } catch (err) {
    console.error(`RPC ${fnName} exception:`, err)
    return false
  }
}

// ==========================================
// rpcBooleanWithParam — for boolean RPCs with parameters
// ==========================================
/**
 * Call a Supabase RPC function that takes params and returns boolean.
 *
 * Covers: has_role(p_role), has_role_uid(p_uid, p_role)
 */
export async function rpcBooleanWithParam(
  supabase: AnySupabaseClient,
  fnName: string,
  params: Record<string, unknown>
): Promise<boolean> {
  try {
    const { data, error } = await callRpc(supabase, fnName, params)

    if (error) {
      console.error(`RPC ${fnName} error:`, error.message)
      return false
    }

    return data === true
  } catch (err) {
    console.error(`RPC ${fnName} exception:`, err)
    return false
  }
}

// ==========================================
// rpcJsonb — for RPCs returning JSONB objects
// ==========================================
/**
 * Call a Supabase RPC function that returns a JSONB object.
 *
 * Covers: create_fee_entry_v2(), moderate_entry(), resolve_dispute(), etc.
 *
 * Returns a discriminated union:
 *   { ok: true, data: T }    — RPC succeeded
 *   { ok: false, error: msg } — RPC failed (network, permission, business logic)
 *
 * Callers MUST check `result.ok` before accessing `result.data`:
 *   const result = await rpcJsonb<{ entry_id: string }>(supabase, 'create_fee_entry_v2', params)
 *   if (!result.ok) { showError(result.error); return }
 *   console.log(result.data.entry_id)  // TS knows this is safe
 */
export async function rpcJsonb<T>(
  supabase: AnySupabaseClient,
  fnName: string,
  params: Record<string, unknown>
): Promise<RpcResult<T>> {
  try {
    const { data, error } = await callRpc(supabase, fnName, params)

    if (error) {
      console.error(`RPC ${fnName} error:`, error.message)
      return { ok: false, error: error.message }
    }

    // Check if the RPC itself returned a business error
    // (FeeLens convention: { success: false, error: "..." } or { error: "..." })
    const obj = data as Record<string, unknown> | null
    if (obj && obj.success === false && typeof obj.error === 'string') {
      return { ok: false, error: obj.error }
    }
    if (obj && typeof obj.error === 'string' && !('success' in obj)) {
      return { ok: false, error: obj.error }
    }

    return { ok: true, data: data as T }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`RPC ${fnName} exception:`, msg)
    return { ok: false, error: msg }
  }
}
