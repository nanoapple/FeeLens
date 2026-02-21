// src/app/api/home/route.ts
// ==========================================
// FeeLens — Home Feed API (v1.1)
//
// GET /api/home
//
// Fixes from v1.0 review:
//   P0-1: Uses service role client (bypasses RLS safely)
//   P0-2: Renamed fees_tracked_label (was hidden_fees_exposed_label)
//   P0-3: Stats via rpc_home_stats() — single DB call, no Node reduce
//   P1-1: Popular links include industry param
//
// Security:
//   - Read-only, no auth required (public homepage data)
//   - Service role client used ONLY in this server-side route handler
//   - v_public_entries already filters to visibility='public' + approved
//   - Only whitelisted fields returned
//
// Caching:
//   - revalidate: 60 (ISR)
// ==========================================

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/client.service'
import type { HomeResponse, HomeErrorResponse } from '@/types/home'

export const revalidate = 60

const RECENT_LIMIT = 6

function errorResponse(message: string, status = 503) {
  const body: HomeErrorResponse = {
    ok: false,
    error_code: 'HOME_FEED_UNAVAILABLE',
    message,
  }
  return NextResponse.json(body, { status })
}

/**
 * Format dollars as compact AUD string.
 * 4200000 → "$4.2M", 350000 → "$350K", 1234 → "$1,234"
 * Tolerates string input (Postgres numeric may arrive as string).
 */
function formatCompactAUD(dollars: number | string): string {
  const v = Math.abs(Number(dollars))
  if (isNaN(v) || v === 0) return '$0'
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (v >= 1_000) {
    const k = v / 1_000
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
  }
  return `$${v.toLocaleString('en-AU')}`
}

export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    // ── 1. Stats via RPC (single DB call, all aggregation server-side) ───
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: statsRaw, error: statsErr } = await (supabase.rpc as any)(
      'rpc_home_stats'
    )

    if (statsErr) {
      return errorResponse(`rpc_home_stats: ${statsErr.message}`)
    }

    const statsData = statsRaw as {
      approved_entries_total: number
      approved_providers_total: number
      industries_total: number
      fees_tracked_total: number | string | null
    } | null

    // Tolerant parsing: Postgres numeric may arrive as string in JSONB
    const feesTracked = Number(statsData?.fees_tracked_total ?? 0)

    const stats = {
      approved_fee_entries_total: statsData?.approved_entries_total ?? 0,
      approved_providers_total: statsData?.approved_providers_total ?? 0,
      industries_total: statsData?.industries_total ?? 10,
      fees_tracked_label: !isNaN(feesTracked) && feesTracked > 0
        ? formatCompactAUD(feesTracked)
        : '$0',
      generated_at: new Date().toISOString(),
    }

    // ── 2. Recent reports from v_public_entries ──────────────────────────
    const { data: recent, error: recentErr } = await supabase
      .from('v_public_entries')
      .select(
        'id, provider_name, provider_suburb, provider_state, provider_postcode, industry_key, display_total, evidence_tier, quote_transparency_score, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT)

    if (recentErr) {
      return errorResponse(`recent_reports: ${recentErr.message}`)
    }

    // ── 3. Popular links (static, returned by server for consistency) ────
    // Include industry param so URL structure matches hero search
    const popular = [
      { label: 'Sydney CBD', href: '/entries?industry=real_estate&q=2000' },
      { label: 'Melbourne 3000', href: '/entries?industry=real_estate&q=3000' },
      { label: 'Ray White', href: '/entries?industry=real_estate&q=ray+white' },
      { label: 'LJ Hooker', href: '/entries?industry=real_estate&q=lj+hooker' },
    ]

    // ── 4. Map recent to contract shape ──────────────────────────────────
    const recent_reports = (recent ?? []).map((r) => {
      const parts = [r.provider_suburb, r.provider_state].filter(Boolean)
      // Only use postcode if it's a valid 4-digit AU postcode
      const postcode = /^\d{4}$/.test(r.provider_postcode ?? '') ? r.provider_postcode : null
      const location_label =
        parts.length > 0
          ? parts.join(', ')
          : postcode ?? ''

      const total = Number(r.display_total)
      const total_label =
        !isNaN(total) && total > 0
          ? `$${total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
          : '—'

      return {
        entry_id: r.id,
        provider_name: r.provider_name ?? 'Provider',
        industry_key: r.industry_key ?? 'unknown',
        location_label,
        total_label,
        evidence_tier: r.evidence_tier ?? 'C',
        transparency_score: r.quote_transparency_score ?? null,
        created_at: r.created_at,
      }
    })

    // ── 5. Assemble response ─────────────────────────────────────────────
    const payload: HomeResponse = {
      version: 'v1',
      stats,
      recent_reports,
      popular,
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(message, 500)
  }
}
