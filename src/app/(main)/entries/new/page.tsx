'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LegalFeeForm } from '@/components/forms/legal-fee-form'

// ==========================================
// /entries/new?industry=legal_services&provider=<uuid>
//
// 统一提交入口：
//   - industry=legal_services → 渲染 LegalFeeForm（v2）
//   - industry=real_estate 或无 industry → 跳转到 /submit（legacy）
// ==========================================

interface Provider {
  id: string
  name: string
  status: string
  industry_tags: string[]
}

export default function NewEntryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const industryKey = searchParams.get('industry') || ''
  const providerId = searchParams.get('provider') || ''

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (industryKey === 'real_estate' || (!industryKey && providerId)) {
      router.replace(`/submit?provider=${providerId}`)
    }
  }, [industryKey, providerId, router])

  useEffect(() => {
    async function loadProvider() {
      if (!providerId) {
        setError('No provider specified. Please select a provider from the list first.')
        setLoading(false)
        return
      }
      if (!industryKey || industryKey === 'real_estate') return

      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('providers')
        .select('id, name, status, industry_tags')
        .eq('id', providerId)
        .eq('status', 'approved')
        .single()

      if (fetchError || !data) {
        setError('Provider not found or not yet approved.')
      } else {
        setProvider(data as Provider)
      }
      setLoading(false)
    }
    loadProvider()
  }, [providerId, industryKey])

  if (loading) return (<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-pulse text-gray-500">Loading...</div></div>)

  if (error || !provider) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <h2 className="text-lg font-bold text-red-800 mb-2">Error</h2>
            <p className="text-red-700">{error || 'Unable to load provider.'}</p>
          </div>
          <a href="/entries" className="inline-block mt-4 text-sm text-orange-600 hover:underline">&larr; Back to entries</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <a href="/entries" className="text-sm text-gray-500 hover:text-orange-600 mb-6 inline-block">&larr; Back to entries</a>
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <LegalFeeForm providerId={provider.id} providerName={provider.name} industryKey={industryKey} />
        </div>
      </div>
    </div>
  )
}
