// src/app/(main)/entries/new/page.tsx

import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import { LegalFeeForm } from '@/components/forms/legal-fee-form'

type SearchParams = {
  industry?: string
  provider?: string
}

// Keep this local to avoid 'never' inference if Database types are incomplete/outdated.
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

  // Cast table access to avoid TS inferring `never` when generated Database types
  // do not yet include the latest provider columns (e.g., industry_tags).
  const { data, error } = (await supabase
    .from('providers' as any)
    .select('id,name,status,industry_tags')
    .eq('id', providerId)
    .maybeSingle()) as {
    data: ProviderRow | null
    error: unknown
  }

  if (error || !data) notFound()
  if (data.status !== 'approved') notFound()

  // If industry is provided, ensure provider supports it.
  if (industryKey) {
    const tags = Array.isArray(data.industry_tags) ? data.industry_tags : []
    if (!tags.includes(industryKey)) notFound()
  }

  // v2 path (schema-driven) only for legal_services for now.
  if (industryKey === 'legal_services') {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <LegalFeeForm providerId={data.id} providerName={data.name} industryKey={industryKey} />
      </div>
    )
  }

  // legacy path (real_estate / unspecified / others)
  redirect(`/submit?provider=${encodeURIComponent(providerId)}`)
}
