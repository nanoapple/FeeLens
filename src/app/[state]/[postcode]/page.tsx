 // src/app/[state]/[postcode]/page.tsx
import { Metadata } from 'next'

interface PageProps {
  params: {
    state: string
    postcode: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state, postcode } = params
  
  return {
    title: `${state.toUpperCase()} ${postcode} 物业管理费用对比 - FeeLens`,
    description: `查看 ${state.toUpperCase()} ${postcode} 地区物业管理公司的收费情况`,
  }
}

export default function LocationPage({ params }: PageProps) {
  const { state, postcode } = params
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">
          {state.toUpperCase()} {postcode} 物业管理费用
        </h1>
        
        <p className="text-gray-600 mb-8">
          该页面为 SEO 静态集合页，将在构建时生成完整数据。
        </p>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            ⚠️ 当前为开发模式，SEO 数据需要在生产构建时生成。
          </p>
        </div>
        
        <div className="mt-8">
          <a href="/" className="text-blue-600 hover:underline">
            ← 返回首页
          </a>
        </div>
      </div>
    </div>
  )
}

