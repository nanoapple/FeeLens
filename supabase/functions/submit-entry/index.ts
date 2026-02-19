// ==========================================
// Edge Function: submit-entry (patched for local ES256 auth)
//
// Purpose:
// - Accept simplified "submit" payloads (non-legal industries)
// - Validate input (UX layer)
// - Authenticate via /auth/v1/user (works with ES256)
// - Call DB RPC (single write path)
//
// NOTE:
// This implementation targets the same DB RPC "create_fee_entry_v2" with
// industry_key defaulting to 'real_estate'. If your repo uses a different
// RPC for submit-entry, rename the RPC accordingly.
//
// Expected config.toml (local):
//   [functions.submit-entry]
//   verify_jwt = false
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ApiErrorPayload = {
  ok: false
  error_code: string
  message: string
  details?: unknown
}

type OkPayload<T> = {
  ok: true
  data: T
}

function json<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

async function requireUser(req: Request): Promise<
  | { ok: true; user: { id: string; email?: string | null }; token: string }
  | { ok: false; res: Response }
> {
  const token = getBearerToken(req)
  if (!token) {
    return {
      ok: false,
      res: json<ApiErrorPayload>(
        { ok: false, error_code: 'AUTH_REQUIRED', message: 'Not signed in.' },
        401
      ),
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      res: json<ApiErrorPayload>(
        {
          ok: false,
          error_code: 'SERVER_MISCONFIG',
          message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY.',
        },
        500
      ),
    }
  }

  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!r.ok) {
    return {
      ok: false,
      res: json<ApiErrorPayload>(
        { ok: false, error_code: 'AUTH_INVALID', message: 'Session expired or invalid.' },
        401
      ),
    }
  }

  const user = await r.json()
  return { ok: true, user, token }
}

function mapRpcError(message: string): { code: string; message: string } {
  const m = message.toLowerCase()
  if (m.includes('not authenticated') || m.includes('unauthorized')) {
    return { code: 'AUTH_REQUIRED', message: 'Please sign in to submit.' }
  }
  if (m.includes('provider not found')) {
    return { code: 'PROVIDER_NOT_FOUND', message: 'Provider not found.' }
  }
  if (m.includes('not yet approved') || m.includes('not approved')) {
    return { code: 'PROVIDER_NOT_APPROVED', message: 'Provider is pending verification.' }
  }
  if (m.includes('24小时') || m.includes('rate limit') || m.includes('too many')) {
    return {
      code: 'RATE_LIMITED',
      message: 'You have reached the submission limit. Please try again later.',
    }
  }
  if (m.includes('validation')) {
    return { code: 'VALIDATION_FAILED', message: 'Validation failed.' }
  }
  return { code: 'UNKNOWN', message }
}

// Minimal submit payload (real_estate example). Allow passthrough for future expansion.
const SubmitEntrySchema = z
  .object({
    provider_id: z.string().uuid('Invalid provider ID'),
    // Industry is fixed for this endpoint by default.
    industry_key: z.string().optional().default('real_estate'),

    // Real-estate sample fields
    property_type: z.string().min(1).optional(),
    management_fee_pct: z.number().min(0).max(100).optional(),
    management_fee_incl_gst: z.boolean().optional(),

    // Common
    hidden_items: z.array(z.string()).optional().default([]),
    quote_transparency_score: z.number().int().min(1).max(5).optional(),
    initial_quote_total: z.number().positive().optional(),
    final_total_paid: z.number().positive().optional(),
    evidence_object_key: z.string().optional(),

    // Optional: allow client to pass a context object
    context: z.record(z.unknown()).optional().default({}),
  })
  .passthrough()

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json<ApiErrorPayload>(
      { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' },
      405
    )
  }

  const auth = await requireUser(req)
  if (!auth.ok) return auth.res

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json<ApiErrorPayload>({ ok: false, error_code: 'BAD_JSON', message: 'Invalid JSON body.' }, 400)
  }

  const parsed = SubmitEntrySchema.safeParse(body)
  if (!parsed.success) {
    return json<ApiErrorPayload>(
      {
        ok: false,
        error_code: 'VALIDATION_FAILED',
        message: 'Validation failed.',
        details: parsed.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      },
      400
    )
  }

  // ✅ FIX: define payload/industryKey/context in-scope
  const payload = parsed.data
  const industryKey = payload.industry_key ?? 'real_estate'

  // Build context for RPC-side schema validation. Start from payload.context, then add known fields.
  const context: Record<string, unknown> = {
    ...(payload.context ?? {}),
    property_type: payload.property_type ?? null,
    management_fee_pct: payload.management_fee_pct ?? null,
    management_fee_incl_gst: payload.management_fee_incl_gst ?? null,
    initial_quote_total: payload.initial_quote_total ?? null,
    final_total_paid: payload.final_total_paid ?? null,
    evidence_object_key: payload.evidence_object_key ?? null,
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
  })

  // ✅ IMPORTANT: PostgREST matches RPC signatures by argument names. Use p_*.
  const rpcArgs = {
    p_provider_id: payload.provider_id,
    p_industry_key: industryKey,
    p_service_key: null,
    p_quote_transparency_score: payload.quote_transparency_score ?? null,
    p_hidden_items: payload.hidden_items ?? [],
    p_fee_breakdown: null,
    p_context: context,
  }

  const { data, error } = await supabase.rpc('create_fee_entry_v2', rpcArgs)

  if (error) {
    const mapped = mapRpcError(error.message ?? 'Unknown error')
    return json<ApiErrorPayload>(
      { ok: false, error_code: mapped.code, message: mapped.message, details: { rpc: error } },
      mapped.code === 'AUTH_REQUIRED' ? 401 : 400
    )
  }

  // Normalise business-error shape: { success:false, error:"..." }
  if (data && typeof data === 'object') {
    const anyData = data as Record<string, unknown>
    if (anyData.success === false) {
      const msg = String(anyData.error ?? 'Unknown error')
      const mapped = mapRpcError(msg)
      return json<ApiErrorPayload>(
        { ok: false, error_code: mapped.code, message: mapped.message, details: anyData },
        mapped.code === 'AUTH_REQUIRED' ? 401 : 400
      )
    }
  }

  return json<OkPayload<unknown>>({ ok: true, data }, 200)
})