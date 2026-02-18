// @ts-nocheck
// ==========================================
// Edge Function: create-entry-v2
//
// 通用多行业费用条目创建入口
// 路由：/api/entries/create → v2 RPC
//
// 职责：
//   1. JWT 验证
//   2. Zod 输入校验（体验层：更友好的错误提示）
//   3. 调用单一 RPC: create_fee_entry_v2
//   4. 统一返回结构
//
// 安全模型：
//   - 不传 user_id，RPC 内部用 auth.uid()
//   - RPC 做不可绕过的 schema 白名单 + pricing_model 校验
//   - Edge Function 做更完整的结构校验 + UX 提示
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

// ==========================================
// Zod Schema — 体验层校验
// ==========================================

const DisbursementItemSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().min(0),
  is_estimate: z.boolean().optional(),
})

const FeeBreakdownSchema = z.object({
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
}).passthrough()
// passthrough() allows industry-specific keys that the RPC whitelist will validate

const ContextSchema = z.object({
  matter_type: z.string().optional(),
  jurisdiction: z.string().optional(),
}).passthrough()
// Context is intentionally loose — additionalProperties:true in schema

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

// ==========================================
// CORS
// ==========================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==========================================
// Main
// ==========================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. JWT 验证
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: missing auth header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Zod 输入校验（体验层）
    const body = await req.json()
    const validation = CreateEntryV2Schema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      )
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: errors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = validation.data

    // 3. 调用 RPC（单一调用，业务逻辑在数据库）
    console.log(
      `User ${user.id} creating ${data.industry_key} entry for provider ${data.provider_id}`
    )

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'create_fee_entry_v2',
      {
        p_provider_id: data.provider_id,
        p_industry_key: data.industry_key,
        p_service_key: data.service_key ?? null,
        p_fee_breakdown: data.fee_breakdown,
        p_context: data.context,
        p_hidden_items: data.hidden_items,
        p_quote_transparency_score: data.quote_transparency_score ?? null,
        p_initial_quote_total: data.initial_quote_total ?? null,
        p_final_total_paid: data.final_total_paid ?? null,
        p_evidence_object_key: data.evidence_object_key ?? null,
      }
    )

    if (rpcError) {
      console.error('RPC error:', rpcError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal server error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. 处理 RPC 返回（可能是业务错误）
    if (rpcResult && typeof rpcResult === 'object' && 'error' in rpcResult) {
      console.warn('RPC business error:', rpcResult.error)
      return new Response(
        JSON.stringify({
          success: false,
          error: rpcResult.error,
          details: rpcResult.details ?? null,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. 成功
    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unhandled error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
