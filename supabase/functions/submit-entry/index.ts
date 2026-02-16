// @ts-nocheck
// ==========================================
// Edge Function: submit-entry
// 职责：JWT 验证 + 输入校验 + 调用 RPC
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

type SubmitEntryInput = {
  provider_id: string
  property_type: 'apartment' | 'house' | 'commercial'
  management_fee_pct: number
  management_fee_incl_gst: boolean
  letting_fee_weeks?: number | null
  inspection_fee_fixed?: number | null
  repair_margin_pct?: number | null
  break_fee_amount?: number | null
  hidden_items: string[]
  quote_transparency_score?: number | null
  initial_quote_total?: number | null
  final_total_paid?: number | null
}

const SubmitEntrySchema = z.object({
  provider_id: z.string().uuid('无效的商家 ID'),
  property_type: z.enum(['apartment', 'house', 'commercial'], {
    errorMap: () => ({ message: '物业类型必须是 apartment、house 或 commercial' })
  }),
  management_fee_pct: z.number()
    .min(0, '管理费百分比不能小于 0')
    .max(100, '管理费百分比不能大于 100'),
  management_fee_incl_gst: z.boolean(),
  letting_fee_weeks: z.number().min(0).max(10).optional(),
  inspection_fee_fixed: z.number().min(0).optional(),
  repair_margin_pct: z.number().min(0).max(100).optional(),
  break_fee_amount: z.number().min(0).optional(),
  hidden_items: z.array(z.string()).default([]),
  quote_transparency_score: z.number().min(1).max(5).optional(),
  initial_quote_total: z.number().positive().optional(),
  final_total_paid: z.number().positive().optional(),
})

// ==========================================
// CORS 头（允许前端调用）
// ==========================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==========================================
// 主函数
// ==========================================
serve(async (req: Request) => {
  // 处理 CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ==========================================
    // 1. JWT 验证
    // ==========================================
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: 缺少认证信息' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 创建 Supabase 客户端（使用 anon key + 用户的 JWT）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // 验证 JWT 并获取用户信息
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('JWT 验证失败:', authError)
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: 无效的认证令牌' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`用户 ${user.id} 开始提交费用条目`)

    // ==========================================
    // 2. 输入校验（Zod）
    // ==========================================
    const body = await req.json()
    const validation = SubmitEntrySchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      console.error('输入校验失败:', errors)
      
      return new Response(
        JSON.stringify({
          success: false,
          error: '输入数据不符合要求',
          details: errors
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const data = validation.data as SubmitEntryInput

    // 调用 Postgres RPC（业务逻辑在数据库）
    console.log(`调用 RPC: submit_fee_entry for provider ${data.provider_id}`)

    const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_fee_entry', {
      p_provider_id: data.provider_id,
      p_property_type: data.property_type,
      p_management_fee_pct: data.management_fee_pct,
      p_management_fee_incl_gst: data.management_fee_incl_gst,
      p_letting_fee_weeks: data.letting_fee_weeks ?? null,
      p_inspection_fee_fixed: data.inspection_fee_fixed ?? null,
      p_repair_margin_pct: data.repair_margin_pct ?? null,
      p_break_fee_amount: data.break_fee_amount ?? null,
      p_hidden_items: data.hidden_items,
      p_quote_transparency_score: data.quote_transparency_score ?? null,
      p_initial_quote_total: data.initial_quote_total ?? null,
      p_final_total_paid: data.final_total_paid ?? null,
    })

    if (rpcError) {
      console.error('RPC 调用失败:', rpcError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal server error: 提交处理失败'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ==========================================
    // 5. 检查 RPC 返回的业务错误
    // ==========================================
    if (rpcResult && typeof rpcResult === 'object' && 'error' in rpcResult) {
      console.warn('业务逻辑错误:', rpcResult.error)
      return new Response(
        JSON.stringify({
          success: false,
          error: rpcResult.error
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ==========================================
    // 6. 返回成功
    // ==========================================
    console.log(`提交成功: entry_id=${rpcResult.entry_id}, visibility=${rpcResult.visibility}`)

    return new Response(
      JSON.stringify(rpcResult),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Edge Function 异常:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error: ' + (error instanceof Error ? error.message : '未知错误')
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
