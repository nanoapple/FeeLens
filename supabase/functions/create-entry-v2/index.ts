// ==========================================
// Edge Function: create-entry-v2 (patched for local ES256 auth)
//
// Key change:
// - Works when local GoTrue issues ES256 JWTs by disabling gateway verify_jwt
//   and performing auth via /auth/v1/user inside the function.
//
// Expected config.toml (local):
//   [functions.create-entry-v2]
//   verify_jwt = false
//
// Response contract:
//   Success: { ok: true, data: <rpc result> }
//   Error:   { ok: false, error_code, message, details? }
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

// ------------------------------------------
// CORS
// ------------------------------------------
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ------------------------------------------
// Error helpers
// ------------------------------------------

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
  if (m.includes('industry schema not found')) {
    return { code: 'SCHEMA_NOT_FOUND', message: 'Industry schema not found.' }
  }
  if (m.includes('inactive')) {
    return { code: 'SCHEMA_INACTIVE', message: 'Industry schema is inactive.' }
  }
  if (m.includes('validation')) {
    return { code: 'VALIDATION_FAILED', message: 'Validation failed.' }
  }
  return { code: 'UNKNOWN', message }
}

// ------------------------------------------
// Zod schema (UX layer)
// ------------------------------------------

const DisbursementItemSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().min(0),
  is_estimate: z.boolean().optional(),
})

const FeeBreakdownSchema = z
  .object({
    pricing_model: z.enum(['fixed', 'hourly', 'blended', 'retainer', 'conditional']),
    fixed_fee_amount: z.number().min(0).optional(),
    hourly_rate: z.number().min(0).optional(),
    estimated_hours: z.number().min(0).optional(),
    retainer_amount: z.number().min(0).optional(),
    uplift_pct: z.number().min(0).max(100).optional(),
    contingency_pct: z.number().min(0).max(100).optional(),
    disbursements_total: z.number().min(0).optional(),
    disbursements_items: z.array(DisbursementItemSchema).optional(),
    gst_included: z.boolean(),
    total_estimated: z.number().min(0).optional(),
  })
  .passthrough()

const ContextSchema = z
  .object({
    matter_type: z.string().optional(),
    jurisdiction: z.string().optional(),
  })
  .passthrough()

const CreateEntryV2Schema = z.object({
  provider_id: z.string().uuid('Invalid provider ID'),
  industry_key: z.string().min(1, 'industry_key is required'),
  service_key: z.string().optional(),
  fee_breakdown: FeeBreakdownSchema,
  context: ContextSchema.optional().default({}),
  hidden_items: z.array(z.string()).optional().default([]),
  quote_transparency_score: z.number().int().min(1).max(5).optional(),
  initial_quote_total: z.number().positive().optional(),
  final_total_paid: z.number().positive().optional(),
  evidence_object_key: z.string().optional(),
})

// ------------------------------------------
// Main
// ------------------------------------------

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
    return json<ApiErrorPayload>(
      { ok: false, error_code: 'BAD_JSON', message: 'Invalid JSON body.' },
      400
    )
  }

  const parsed = CreateEntryV2Schema.safeParse(body)
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

  const payload = parsed.data

  // Supabase client for RPC
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  })

  // ✅ IMPORTANT: PostgREST matches RPC signatures by argument names.
  // Your DB function is very likely defined with p_* argument names, so we map explicitly.
  // Also enrich context with totals/evidence to keep a single predictable place for optional fields.
  const context: Record<string, unknown> = {
    ...(payload.context ?? {}),
    initial_quote_total: payload.initial_quote_total ?? null,
    final_total_paid: payload.final_total_paid ?? null,
    evidence_object_key: payload.evidence_object_key ?? null,
  }

  const rpcArgs = {
    p_provider_id: payload.provider_id,
    p_industry_key: payload.industry_key,
    p_service_key: payload.service_key ?? null,
    p_quote_transparency_score: payload.quote_transparency_score ?? null,
    p_hidden_items: payload.hidden_items ?? [],
    p_fee_breakdown: payload.fee_breakdown ?? null,
    p_context: context,
  }

  // IMPORTANT: this RPC name must exist in DB migrations.
  const { data, error } = await supabase.rpc('create_fee_entry_v2', rpcArgs)

  if (error) {
    const mapped = mapRpcError(error.message ?? 'Unknown error')
    return json<ApiErrorPayload>(
      { ok: false, error_code: mapped.code, message: mapped.message, details: { rpc: error } },
      mapped.code === 'AUTH_REQUIRED' ? 401 : 400
    )
  }

  // Normalise business-layer errors (if RPC returns {success:false,...})
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