// @ts-nocheck
// ==========================================
// Edge Function: upload-sign
// 职责：
//   1. JWT 验证 + 输入校验
//   2. 调用 RPC create_evidence_upload（DB 登记）
//   3. 使用 service_role 生成 signed upload URL
//   4. 返回 signed URL + token + evidence_id
//
// 安全模型：
//   - 用户身份由 RPC 内部 auth.uid() 决定
//   - signed URL 只能上传到 RPC 返回的 object_key
//   - service_role 仅在 Edge Function 内使用，不暴露给客户端
// ==========================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const UploadSignSchema = z.object({
  mime_type: z.enum(
    ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    { errorMap: () => ({ message: '文件类型必须是 JPEG、PNG、WebP 或 PDF' }) }
  ),
  file_size_bytes: z
    .number()
    .int()
    .positive('文件大小必须大于 0')
    .max(10485760, '文件大小不能超过 10 MB'),
  entry_id: z.string().uuid().optional(),
})

// 完整 CORS headers（含 Allow-Methods）
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // 用户级客户端（auth.uid() 生效）
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: 无效的认证令牌' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. 输入校验
    const body = await req.json()
    const validation = UploadSignSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      return new Response(
        JSON.stringify({ success: false, error: '输入数据不符合要求', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = validation.data

    // 3. 调用 RPC 登记证据
    console.log(`用户 ${user.id} 请求上传签名: ${data.mime_type}, ${data.file_size_bytes} bytes`)

    const { data: rpcResult, error: rpcError } = await supabaseUser.rpc('create_evidence_upload', {
      p_mime_type: data.mime_type,
      p_file_size_bytes: data.file_size_bytes,
      p_entry_id: data.entry_id ?? null,
    })

    if (rpcError) {
      console.error('RPC 调用失败:', rpcError)
      return new Response(
        JSON.stringify({ success: false, error: '服务器内部错误' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (rpcResult && typeof rpcResult === 'object' && 'error' in rpcResult) {
      return new Response(
        JSON.stringify({ success: false, error: rpcResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { evidence_id, object_key } = rpcResult

    // 4. 使用 service_role 生成 signed upload URL
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: signedData, error: signError } = await supabaseAdmin.storage
      .from('evidence')
      .createSignedUploadUrl(object_key, {
        upsert: false,
      })

    if (signError || !signedData) {
      console.error('签名生成失败:', signError)
      return new Response(
        JSON.stringify({ success: false, error: '无法生成上传链接' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. 返回（包含 token + object_key，前端用 SDK uploadToSignedUrl）
    return new Response(
      JSON.stringify({
        success: true,
        evidence_id,
        object_key,
        signed_url: signedData.signedUrl,
        token: signedData.token,
        expires_in: 3600,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge Function 异常:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error: ' + (error instanceof Error ? error.message : '未知错误'),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})