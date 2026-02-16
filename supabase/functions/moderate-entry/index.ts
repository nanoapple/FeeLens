// @ts-nocheck
// ==========================================
// Edge Function: moderate-entry
// 职责：JWT 验证 + 输入校验 + 调用 RPC
// 安全模型：不传 admin_id，RPC 内部用 auth.uid()
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const ModerateEntrySchema = z.object({
  entry_id: z.string().uuid('无效的条目 ID'),
  action: z.enum(['approve', 'reject', 'hide'], {
    errorMap: () => ({ message: '操作必须是 approve、reject 或 hide' })
  }),
  reason: z.string().max(2000).optional(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. JWT 验证
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: 缺少认证信息' }),
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
        JSON.stringify({ success: false, error: 'Unauthorized: 无效的认证令牌' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. 输入校验
    const body = await req.json()
    const validation = ModerateEntrySchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      return new Response(
        JSON.stringify({ success: false, error: '输入数据不符合要求', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = validation.data

    // 3. 调用 RPC（不传 admin_id，RPC 内部用 auth.uid() + 角色校验）
    console.log(`管理员 ${user.id} 审核条目 ${data.entry_id}, action=${data.action}`)

    const { data: rpcResult, error: rpcError } = await supabase.rpc('moderate_entry', {
      p_entry_id: data.entry_id,
      p_action: data.action,
      p_reason: data.reason ?? null,
    })

    if (rpcError) {
      console.error('RPC 调用失败:', rpcError)
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error: 审核处理失败' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. 检查 RPC 业务错误
    if (rpcResult && typeof rpcResult === 'object' && 'error' in rpcResult) {
      const status = rpcResult.error.includes('Unauthorized') ? 403 : 400
      return new Response(
        JSON.stringify({ success: false, error: rpcResult.error }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. 返回成功
    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge Function 异常:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + (error instanceof Error ? error.message : '未知错误') }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
