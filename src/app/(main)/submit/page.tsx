// src/app/(main)/submit/page.tsx
// ==========================================
// Legacy real_estate submit page (Server Component)
//
// Auth guard: logged in = allowed (any role — NOT has_role('user'))
// Provider gate: must exist AND be approved
// Write path: FeeEntryForm → submitEntry() → Edge submit-entry → RPC
// ==========================================

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'
import { FeeEntryForm } from '@/components/forms/fee-entry-form'

type Provider = {
  id: string
  name: string
  status: string
}

interface PageProps {
  searchParams: { provider?: string }
}

export default async function SubmitPage({ searchParams }: PageProps) {
  const providerId = searchParams.provider

  if (!providerId) {
    redirect('/')
  }

  const supabase = createServerSupabaseClient()

  // ── Auth guard: logged in = allowed (any role) ──────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    const callbackUrl = `/submit?provider=${encodeURIComponent(providerId)}`
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  // ── Provider gate ───────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('providers')
    .select('id, name, status')
    .eq('id', providerId)
    .maybeSingle()

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="font-medium text-amber-800">Provider not found</p>
          <p className="text-sm text-amber-700 mt-1">
            This service provider doesn&apos;t exist or the link may be incorrect.
          </p>
        </div>
      </div>
    )
  }

  const provider = data as Provider

  if (provider.status !== 'approved') {
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

  return (
    <div className="container mx-auto py-8">
      <FeeEntryForm providerId={provider.id} providerName={provider.name} />
    </div>
  )
}
