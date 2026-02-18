'use client'

import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { submitEntry, type SubmitEntryParams } from '@/lib/supabase/functions'
import { getCurrentUser } from '@/lib/supabase/client.browser'

interface FeeEntryFormProps {
  providerId: string
  providerName: string
}

export function FeeEntryForm({ providerId, providerName }: FeeEntryFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState(false)

  // 表单字段状态
  const [propertyType, setPropertyType] = useState<'apartment' | 'house' | 'commercial'>('apartment')
  const [managementFeePct, setManagementFeePct] = useState<string>('8.5')
  const [managementFeeInclGst, setManagementFeeInclGst] = useState(true)
  const [lettingFeeWeeks, setLettingFeeWeeks] = useState<string>('')
  const [inspectionFeeFixed, setInspectionFeeFixed] = useState<string>('')
  const [repairMarginPct, setRepairMarginPct] = useState<string>('')
  const [breakFeeAmount, setBreakFeeAmount] = useState<string>('')
  const [hiddenItems, setHiddenItems] = useState<string[]>([])
  const [quoteTransparencyScore, setQuoteTransparencyScore] = useState<number>(3)
  const [initialQuoteTotal, setInitialQuoteTotal] = useState<string>('')
  const [finalTotalPaid, setFinalTotalPaid] = useState<string>('')

  // 常见隐藏费用选项
  const hiddenFeeOptions = [
    { value: 'annual_report_fee', label: '年度报告费' },
    { value: 'maintenance_markup', label: '维修加成' },
    { value: 'card_surcharge', label: '刷卡附加费' },
    { value: 'admin_fee', label: '行政管理费' },
    { value: 'late_payment_fee', label: '逾期付款费' },
    { value: 'early_termination_fee', label: '提前终止费' },
    { value: 'inspection_report_fee', label: '巡检报告费' },
  ]

  const toggleHiddenItem = (item: string) => {
    setHiddenItems((prev: string[]) =>
      prev.includes(item)
        ? prev.filter((i: string) => i !== item)
        : [...prev, item]
    )
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setIsSubmitting(true)

    try {
      // 1. 检查是否登录
      const user = await getCurrentUser()
      if (!user) {
        setError('请先登录')
        setIsSubmitting(false)
        return
      }

      // 2. 构造提交参数
      const params: SubmitEntryParams = {
        provider_id: providerId,
        property_type: propertyType,
        management_fee_pct: parseFloat(managementFeePct),
        management_fee_incl_gst: managementFeeInclGst,
        hidden_items: hiddenItems,
        quote_transparency_score: quoteTransparencyScore,
      }

      // 添加可选字段
      if (lettingFeeWeeks) {
        params.letting_fee_weeks = parseFloat(lettingFeeWeeks)
      }
      if (inspectionFeeFixed) {
        params.inspection_fee_fixed = parseFloat(inspectionFeeFixed)
      }
      if (repairMarginPct) {
        params.repair_margin_pct = parseFloat(repairMarginPct)
      }
      if (breakFeeAmount) {
        params.break_fee_amount = parseFloat(breakFeeAmount)
      }
      if (initialQuoteTotal) {
        params.initial_quote_total = parseFloat(initialQuoteTotal)
      }
      if (finalTotalPaid) {
        params.final_total_paid = parseFloat(finalTotalPaid)
      }

      // 3. 调用封装的函数（不直接 insert）
      const result = await submitEntry(params)

      if (!result.success) {
        setError(result.error || '提交失败')
        setIsSubmitting(false)
        return
      }

      // 4. 成功处理
      setSuccess(true)
      
      // 显示提示信息
      if (result.requires_moderation) {
        alert('提交成功！您的条目需要人工审核，审核通过后将公开显示。')
      } else {
        alert('提交成功！感谢您的贡献。')
      }

      // 3 秒后跳转回商家详情页
      setTimeout(() => {
        router.push(`/providers/${providerId}`)
      }, 3000)

    } catch (err) {
      console.error('提交时发生错误:', err)
      setError('网络错误，请检查连接后重试')
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-2xl font-bold text-green-800 mb-4">✓ 提交成功</h2>
        <p className="text-green-700">
          感谢您的贡献！正在跳转回商家页面...
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-2">分享费用经历</h2>
      <p className="text-gray-600 mb-6">
        为 <span className="font-semibold">{providerName}</span> 提交费用信息
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 物业类型 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            物业类型 *
          </label>
          <select
            value={propertyType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setPropertyType(e.target.value as 'apartment' | 'house' | 'commercial')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="apartment">公寓</option>
            <option value="house">独立屋</option>
            <option value="commercial">商业物业</option>
          </select>
        </div>

        {/* 管理费百分比 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            管理费百分比 (%) *
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={managementFeePct}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setManagementFeePct(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：8.5"
            required
          />
        </div>

        {/* 是否含 GST */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="incl_gst"
            checked={managementFeeInclGst}
            onChange={(e) => setManagementFeeInclGst(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="incl_gst" className="ml-2 text-sm text-gray-700">
            管理费含 GST
          </label>
        </div>

        {/* 招租费（可选） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            招租费（周租金倍数）
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={lettingFeeWeeks}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLettingFeeWeeks(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：1.0（1周租金）"
          />
        </div>

        {/* 巡检费（可选） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            例行巡检费（固定金额 AUD）
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={inspectionFeeFixed}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInspectionFeeFixed(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：80"
          />
        </div>

        {/* 维修加成（可选） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            维修加成百分比 (%)
          </label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={repairMarginPct}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setRepairMarginPct(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：15"
          />
        </div>

        {/* 解约费（可选） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            提前解约费（AUD）
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={breakFeeAmount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBreakFeeAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：500"
          />
        </div>

        {/* 隐藏费用（多选） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            遇到的隐藏费用（可多选）
          </label>
          <div className="grid grid-cols-2 gap-2">
            {hiddenFeeOptions.map((option) => (
              <label key={option.value} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={hiddenItems.includes(option.value)}
                  onChange={() => toggleHiddenItem(option.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 报价透明度评分 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            报价透明度评分（1-5 分）
          </label>
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => setQuoteTransparencyScore(score)}
                className={`px-4 py-2 rounded-md font-semibold ${
                  quoteTransparencyScore === score
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            1=完全不透明，5=非常透明
          </p>
        </div>

        {/* 费用对比（可选） */}
        <div className="border-t pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">费用对比（可选）</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                初始报价总额（AUD）
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialQuoteTotal}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInitialQuoteTotal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1000.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                实际支付总额（AUD）
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={finalTotalPaid}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFinalTotalPaid(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1150.00"
              />
            </div>
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '提交中...' : '提交'}
          </button>
        </div>
      </form>
    </div>
  )
}
