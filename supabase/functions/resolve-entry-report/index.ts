// ==========================================
// Edge Function: resolve-entry-report
//
// 职责：JWT 验证 + 输入校验 + 调用 RPC
// 对应 DB: resolve_entry_report(p_report_id, p_action, p_note)
// 见 migration: 20260218000004_patch_resolve_entry_report.sql
//
// 安全模型：不传 actor_id，RPC 内部用 auth.uid() + is_moderator_or_admin()
//
// 关键语义（只动 entry_reports，不动 fee_entries）：
//   dismiss → status = 'dismissed'（举报无效，关闭工单）
//   triage  → status = 'triaged'  （待进一步调查）
//   resolve → status = 'resolved' （举报有效已处理）
//
// HTTP 状态码映射（与 RPC 返回语义对齐）：
//   200 → 成功
//   400 → 输入校验失败 / 无效 action
//   401 → JWT 缺失或无效
//   403 → 权限不足（非 admin/moderator）
//   409 → 状态机冲突（report 已终态，或 triage 非 open 状态）
//   500 → DB / 运行时异常
// ==========================================

// ✅ 正确（与 deno.json 的 imports 匹配）
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ── CORS ────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGIN 通过 Supabase Secrets 注入（不硬编码域名）：
//   本地开发：supabase secrets set ALLOWED_ORIGIN=http://localhost:3000
//   生产环境：supabase secrets set ALLOWED_ORIGIN=https://feelens.com.au
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000'

function buildCorsHeaders(reqOrigin: string | null): Record<string, string> {
  // 精确匹配：非允许 origin 不携带 ACAO 头，浏览器会阻止跨域请求
  const origin = reqOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ''
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// ── Zod Schema ────────────────────────────────────────────────────────────────
const ResolveEntryReportSchema = z.object({
  report_id: z.string().uuid('Invalid report ID'),
  action: z.enum(['resolve', 'dismiss', 'triage'], {
    errorMap: () => ({ message: "action must be 'resolve', 'dismiss', or 'triage'" }),
  }),
  note: z.string().max(2000).optional(),
})

// resolve_entry_report() RPC 统一返回结构（migration 20260218000004）
interface RpcResult {
  success: boolean
  old_status?: string
  new_status?: string
  error?: string
}

type ResolveEntryReportInput = z.infer<typeof ResolveEntryReportSchema>

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const reqOrigin = req.headers.get('origin')
  const cors = buildCorsHeaders(reqOrigin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  try {
    // 1. JWT 验证
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: missing auth header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 2. 输入校验（Zod）
    const body: unknown = await req.json()
    const validation = ResolveEntryReportSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      )
      return new Response(
        JSON.stringify({ success: false, error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const data: ResolveEntryReportInput = validation.data

    // 3. 调用 RPC（薄层：不传 actor_id，DB 内部用 auth.uid()）
    console.log(`Admin ${user.id} resolving report ${data.report_id}, action=${data.action}`)

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'resolve_entry_report',
      {
        p_report_id: data.report_id,
        p_action:    data.action,
        p_note:      data.note ?? null,
      }
    )

    // 4a. DB / 网络级错误（rpc() 本身抛出）
    if (rpcError) {
      console.error('RPC error:', rpcError)
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 4b. RPC 业务错误（success: false）——按错误语义映射 HTTP 状态码
    //
    // RPC 统一返回 { success: boolean, error?: string }。
    // success: false 路径：
    //   'Unauthorized: ...'          → 403
    //   'terminal state: ...'        → 409（状态机冲突）
    //   'Cannot triage: ...'         → 409（状态机冲突）
    //   其余（not found / invalid）  → 400
    const result = rpcData as RpcResult
    if (result.success === false) {
      const errMsg: string = result.error ?? 'Unknown error'
      let httpStatus = 400
      if (errMsg.includes('Unauthorized')) {
        httpStatus = 403
      } else if (errMsg.includes('terminal state') || errMsg.includes('Cannot triage')) {
        httpStatus = 409
      }
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: httpStatus, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 5. 成功
    return new Response(
      JSON.stringify(rpcData),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('Edge Function error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error: ' + (err instanceof Error ? err.message : 'unknown'),
      }),
      { status: 500, headers: { ...buildCorsHeaders(null), 'Content-Type': 'application/json' } }
    )
  }
})
