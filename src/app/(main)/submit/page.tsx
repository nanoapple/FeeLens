import { redirect } from 'next/navigation'
import { FeeEntryForm } from '@/components/forms/fee-entry-form'
import { createServerSupabaseClient } from '@/lib/supabase/client.server'

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

  // 获取 provider 信息
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('providers')
    .select('id, name, status')
    .eq('id', providerId)
    .eq('status', 'approved')
    .single()

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-red-600">商家未找到</h1>
        <p className="mt-4">该商家不存在或尚未审核通过。</p>
      </div>
    )
  }

  const provider = data as Provider

  return (
    <div className="container mx-auto py-8">
      <FeeEntryForm providerId={provider.id} providerName={provider.name} />
    </div>
  )
}
 
