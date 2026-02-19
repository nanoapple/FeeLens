// src/app/(main)/entries/new/page.tsx
// ==========================================
// V2 entry creation page (Server Component)
//
// Auth guard: logged in = allowed (any role — NOT has_role('user'))
// Routes by industry_key:
//   legal_services → LegalFeeForm (schema-driven, Edge create-entry-v2)
//   others → redirect /submit (legacy Edge submit-entry)
// ==========================================

import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import { LegalFeeForm } from '@/components/forms/legal-fee-form'

type SearchParams = {
  industry?: string
  provider?: string
}

type ProviderRow = {
  id: string
  name: string
  status: string
  industry_tags: string[] | null
}

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const industryKey = (searchParams.industry ?? '').trim()
  const providerId = (searchParams.provider ?? '').trim()

  if (!providerId) notFound()

  const supabase = createServerSupabaseClient()

  // ── Auth guard: logged in = allowed (any role) ──────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    const params = new URLSearchParams()
    if (industryKey) params.set('industry', industryKey)
    params.set('provider', providerId)
    const callbackUrl = `/entries/new?${params.toString()}`
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  // ── Provider gate ───────────────────────────────────────────────────────
  // Type cast at result level only — don't spread `as any` to the query chain
  const { data, error } = await supabase
    .from('providers')
    .select('id,name,status,industry_tags')
    .eq('id', providerId)
    .maybeSingle() as unknown as {
    data: ProviderRow | null
    error: { message: string } | null
  }

  if (error || !data) notFound()

  if (data.status !== 'approved') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="font-medium text-amber-800">Provider pending verification</p>
          <p className="text-sm text-amber-700 mt-1">
            Entries can only be submitted for verified providers. This provider is currently under review.
          </p>
        </div>
      </div>
    )
  }

  // If industry is provided, ensure provider supports it
  if (industryKey) {
    const tags = Array.isArray(data.industry_tags) ? data.industry_tags : []
    if (!tags.includes(industryKey)) {
      return (
        <div className="max-w-2xl mx-auto p-6">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-medium text-amber-800">Industry not supported</p>
            <p className="text-sm text-amber-700 mt-1">
              This provider does not support the selected industry ({industryKey.replace(/_/g, ' ')}).
            </p>
          </div>
        </div>
      )
    }
  }

  // v2 path: legal_services → schema-driven form
  if (industryKey === 'legal_services') {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <LegalFeeForm providerId={data.id} providerName={data.name} industryKey={industryKey} />
      </div>
    )
  }

  // legacy path: real_estate / unspecified
  redirect(`/submit?provider=${encodeURIComponent(providerId)}`)
}
