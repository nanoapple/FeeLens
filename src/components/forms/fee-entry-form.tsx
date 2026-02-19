// src/components/forms/fee-entry-form.tsx
// ==========================================
// Legacy real_estate fee entry form (Client Component)
//
// Write path: submitEntry() → Edge submit-entry → RPC submit_fee_entry
// Error path: classifyError() → ApiErrorDisplay (error_code primary, string fallback)
// Success: router.replace('/entries?mine=true&created=1')
//
// Auth-4b:
//   - ApiError + ApiErrorDisplay (replaces raw string error)
//   - Frontend validation (required + number range) before API call
//   - Anti-double-submit: disabled button + ref guard
//   - Form state cleared before redirect (prevents back-button re-submit)
// ==========================================

'use client'

import { useState, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { submitEntry, type SubmitEntryParams } from '@/lib/supabase/functions'
import { getCurrentUser } from '@/lib/supabase/client.browser'
import { classifyError, type ApiError } from '@/lib/errors'
import { ApiErrorDisplay } from '@/components/ui/api-error-display'

interface FeeEntryFormProps {
  providerId: string
  providerName: string
}

export function FeeEntryForm({ providerId, providerName }: FeeEntryFormProps) {
  const router = useRouter()
  const submitGuard = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState<ApiError | null>(null)
  const [success, setSuccess] = useState(false)

  // ── Form fields ────────────────────────────────────────────────────────
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

  const hiddenFeeOptions = [
    { value: 'annual_report_fee', label: 'Annual report fee' },
    { value: 'maintenance_markup', label: 'Maintenance markup' },
    { value: 'card_surcharge', label: 'Card surcharge' },
    { value: 'admin_fee', label: 'Admin fee' },
    { value: 'late_payment_fee', label: 'Late payment fee' },
    { value: 'early_termination_fee', label: 'Early termination fee' },
    { value: 'inspection_report_fee', label: 'Inspection report fee' },
  ]

  const toggleHiddenItem = (item: string) => {
    setHiddenItems((prev: string[]) =>
      prev.includes(item)
        ? prev.filter((i: string) => i !== item)
        : [...prev, item]
    )
  }

  // ── Frontend validation (two-stage: frontend first, then backend) ──────

  function validateForm(): string | null {
    const feePct = parseFloat(managementFeePct)
    if (!managementFeePct || isNaN(feePct)) {
      return 'Management fee percentage is required.'
    }
    if (feePct <= 0 || feePct > 100) {
      return 'Management fee must be between 0 and 100%.'
    }
    if (lettingFeeWeeks) {
      const v = parseFloat(lettingFeeWeeks)
      if (isNaN(v) || v < 0) return 'Letting fee weeks must be 0 or greater.'
    }
    if (inspectionFeeFixed) {
      const v = parseFloat(inspectionFeeFixed)
      if (isNaN(v) || v < 0) return 'Inspection fee must be 0 or greater.'
    }
    if (repairMarginPct) {
      const v = parseFloat(repairMarginPct)
      if (isNaN(v) || v < 0 || v > 100) return 'Repair margin must be between 0 and 100%.'
    }
    if (breakFeeAmount) {
      const v = parseFloat(breakFeeAmount)
      if (isNaN(v) || v < 0) return 'Break fee must be 0 or greater.'
    }
    if (initialQuoteTotal) {
      const v = parseFloat(initialQuoteTotal)
      if (isNaN(v) || v < 0) return 'Initial quote total must be 0 or greater.'
    }
    if (finalTotalPaid) {
      const v = parseFloat(finalTotalPaid)
      if (isNaN(v) || v < 0) return 'Final total paid must be 0 or greater.'
    }
    return null
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Anti-double-submit
    if (submitGuard.current || isSubmitting) return
    submitGuard.current = true
    setApiError(null)
    setIsSubmitting(true)

    // 1. Frontend validation
    const validationMsg = validateForm()
    if (validationMsg) {
      setApiError({ code: 'VALIDATION_FAILED', message: validationMsg })
      setIsSubmitting(false)
      submitGuard.current = false
      return
    }

    try {
      // 2. Auth check
      const user = await getCurrentUser()
      if (!user) {
        setApiError(classifyError({ error: 'not authenticated' }))
        setIsSubmitting(false)
        submitGuard.current = false
        return
      }

      // 3. Build params
      const params: SubmitEntryParams = {
        provider_id: providerId,
        property_type: propertyType,
        management_fee_pct: parseFloat(managementFeePct),
        management_fee_incl_gst: managementFeeInclGst,
        hidden_items: hiddenItems,
        quote_transparency_score: quoteTransparencyScore,
      }
      if (lettingFeeWeeks) params.letting_fee_weeks = parseFloat(lettingFeeWeeks)
      if (inspectionFeeFixed) params.inspection_fee_fixed = parseFloat(inspectionFeeFixed)
      if (repairMarginPct) params.repair_margin_pct = parseFloat(repairMarginPct)
      if (breakFeeAmount) params.break_fee_amount = parseFloat(breakFeeAmount)
      if (initialQuoteTotal) params.initial_quote_total = parseFloat(initialQuoteTotal)
      if (finalTotalPaid) params.final_total_paid = parseFloat(finalTotalPaid)

      // 4. Single write entry point: Edge Function
      const result = await submitEntry(params)

      if (!result.success) {
        setApiError(classifyError(result))
        setIsSubmitting(false)
        submitGuard.current = false
        return
      }

      // 5. Success — clear state, then redirect
      //    Success confirmation = API returned success, NOT list page visibility
      setSuccess(true)
      // Clear form state so back-button doesn't show stale data
      setManagementFeePct('')
      setHiddenItems([])
      setInitialQuoteTotal('')
      setFinalTotalPaid('')
      router.replace('/entries?mine=true&created=1')

    } catch (err) {
      console.error('Submit error:', err)
      setApiError(classifyError({ error: 'network error' }))
      setIsSubmitting(false)
      submitGuard.current = false
    }
  }

  // ── Success UI (brief flash before redirect completes) ─────────────────

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <h2 className="text-xl font-bold text-green-800 mb-2">✓ Entry submitted successfully</h2>
          <p className="text-green-700">Redirecting to your entries...</p>
        </div>
      </div>
    )
  }

  // ── Form UI ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-2">Share Fee Experience</h2>
      <p className="text-gray-600 mb-6">
        for <span className="font-semibold">{providerName}</span>
      </p>

      <ApiErrorDisplay error={apiError} onDismiss={() => setApiError(null)} className="mb-4" />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Property type *</label>
          <select
            value={propertyType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setPropertyType(e.target.value as 'apartment' | 'house' | 'commercial')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>

        {/* Management fee */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Management fee (%) *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={managementFeePct}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setManagementFeePct(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            required
          />
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={managementFeeInclGst}
              onChange={(e) => setManagementFeeInclGst(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-600">Includes GST</span>
          </label>
        </div>

        {/* Optional fees grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Letting fee (weeks)</label>
            <input type="number" step="0.5" min="0" value={lettingFeeWeeks}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLettingFeeWeeks(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Inspection fee (fixed $)</label>
            <input type="number" step="0.01" min="0" value={inspectionFeeFixed}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setInspectionFeeFixed(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Repair margin (%)</label>
            <input type="number" step="0.1" min="0" max="100" value={repairMarginPct}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRepairMarginPct(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Break fee ($)</label>
            <input type="number" step="0.01" min="0" value={breakFeeAmount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBreakFeeAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Hidden fees */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Hidden or undisclosed fees</label>
          <div className="flex flex-wrap gap-2">
            {hiddenFeeOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleHiddenItem(value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  hiddenItems.includes(value)
                    ? 'bg-orange-100 border-orange-300 text-orange-800'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Transparency score */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quote transparency score *</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => setQuoteTransparencyScore(score)}
                className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                  quoteTransparencyScore === score
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">1 = not transparent, 5 = very transparent</p>
        </div>

        {/* Fee comparison (optional) */}
        <div className="border-t pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Fee comparison (optional)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Initial quote total (AUD)</label>
              <input type="number" step="0.01" min="0" value={initialQuoteTotal}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInitialQuoteTotal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="1000.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Final total paid (AUD)</label>
              <input type="number" step="0.01" min="0" value={finalTotalPaid}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFinalTotalPaid(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="1150.00"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
