'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createEntryV2, type CreateEntryV2Params, type FeeBreakdown, type DisbursementItem } from '@/lib/supabase/functions'
import { getCurrentUser } from '@/lib/supabase/client'
import {
  useIndustrySchema,
  getServiceOptions,
  getRecommendedContextFields,
  type ServiceOption,
  type SchemaProperty,
} from '@/hooks/use-industry-schema'

interface LegalFeeFormProps {
  providerId: string
  providerName: string
  industryKey: string
}

type PricingModel = 'fixed' | 'hourly' | 'blended' | 'retainer' | 'conditional'

const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  fixed: 'Fixed Fee',
  hourly: 'Hourly Rate',
  blended: 'Blended (Hourly + Estimate)',
  retainer: 'Retainer',
  conditional: 'Conditional / No Win No Fee',
}

const JURISDICTION_OPTIONS = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'ACT', label: 'Australian Capital Territory' },
]

export function LegalFeeForm({ providerId, providerName, industryKey }: LegalFeeFormProps) {
  const router = useRouter()
  const { schema, loading: schemaLoading, error: schemaError } = useIndustrySchema(industryKey)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)

  const [serviceKey, setServiceKey] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [pricingModel, setPricingModel] = useState<PricingModel | ''>('')

  const [fixedFeeAmount, setFixedFeeAmount] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [retainerAmount, setRetainerAmount] = useState('')
  const [upliftPct, setUpliftPct] = useState('')
  const [contingencyPct, setContingencyPct] = useState('')
  const [gstIncluded, setGstIncluded] = useState(true)
  const [totalEstimated, setTotalEstimated] = useState('')

  const [disbursements, setDisbursements] = useState<DisbursementItem[]>([])
  const [newDisbLabel, setNewDisbLabel] = useState('')
  const [newDisbAmount, setNewDisbAmount] = useState('')
  const [newDisbEstimate, setNewDisbEstimate] = useState(false)

  const [contextFields, setContextFields] = useState<Record<string, string | number | boolean>>({})

  const [initialQuoteTotal, setInitialQuoteTotal] = useState('')
  const [finalTotalPaid, setFinalTotalPaid] = useState('')
  const [quoteTransparencyScore, setQuoteTransparencyScore] = useState<number>(3)

  const serviceOptions: ServiceOption[] = schema ? getServiceOptions(schema) : []
  const recommendedContext = schema && serviceKey ? getRecommendedContextFields(schema, serviceKey) : []
  const contextSchemaProps = schema?.context_schema?.properties || {}

  function updateContext(key: string, value: string | number | boolean) {
    setContextFields((prev) => ({ ...prev, [key]: value }))
  }

  function renderContextField(key: string, prop: SchemaProperty) {
    const value = contextFields[key] ?? ''
    if (prop.enum) {
      return (
        <select value={value as string} onChange={(e) => updateContext(key, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
          <option value="">Select...</option>
          {prop.enum.map((v) => (<option key={v} value={v}>{v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
        </select>
      )
    }
    if (prop.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!contextFields[key]} onChange={(e) => updateContext(key, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
          <span className="text-sm text-gray-700">Yes</span>
        </label>
      )
    }
    if (prop.type === 'number' || prop.type === 'integer') {
      return (<input type="number" value={value as string} onChange={(e) => updateContext(key, e.target.value ? parseFloat(e.target.value) : '')} min={prop.minimum} max={prop.maximum} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder={prop.description || ''} />)
    }
    return (<input type="text" value={value as string} onChange={(e) => updateContext(key, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder={prop.description || ''} />)
  }

  function addDisbursement() {
    if (!newDisbLabel || !newDisbAmount) return
    setDisbursements((prev) => [...prev, { label: newDisbLabel, amount: parseFloat(newDisbAmount), is_estimate: newDisbEstimate }])
    setNewDisbLabel('')
    setNewDisbAmount('')
    setNewDisbEstimate(false)
  }

  function removeDisbursement(idx: number) {
    setDisbursements((prev) => prev.filter((_, i) => i !== idx))
  }

  const disbursementsTotal = disbursements.reduce((sum, d) => sum + d.amount, 0)

  function canProceedStep1() { return serviceKey && jurisdiction && pricingModel }
  function canProceedStep2() {
    if (!pricingModel) return false
    if (pricingModel === 'fixed' && !fixedFeeAmount) return false
    if (pricingModel === 'hourly' && !hourlyRate) return false
    if (pricingModel === 'blended' && (!hourlyRate || !estimatedHours)) return false
    if (pricingModel === 'retainer' && !retainerAmount) return false
    if (pricingModel === 'conditional' && !upliftPct && !contingencyPct) return false
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const user = await getCurrentUser()
      if (!user) { setError('Please log in first'); setIsSubmitting(false); return }

      const feeBreakdown: FeeBreakdown = { pricing_model: pricingModel as PricingModel, gst_included: gstIncluded }
      if (fixedFeeAmount) feeBreakdown.fixed_fee_amount = parseFloat(fixedFeeAmount)
      if (hourlyRate) feeBreakdown.hourly_rate = parseFloat(hourlyRate)
      if (estimatedHours) feeBreakdown.estimated_hours = parseFloat(estimatedHours)
      if (retainerAmount) feeBreakdown.retainer_amount = parseFloat(retainerAmount)
      if (upliftPct) feeBreakdown.uplift_pct = parseFloat(upliftPct)
      if (contingencyPct) feeBreakdown.contingency_pct = parseFloat(contingencyPct)
      if (totalEstimated) feeBreakdown.total_estimated = parseFloat(totalEstimated)
      if (disbursements.length > 0) {
        feeBreakdown.disbursements_items = disbursements
        feeBreakdown.disbursements_total = disbursementsTotal
      }

      const context: Record<string, unknown> = { matter_type: serviceKey, jurisdiction, ...contextFields }
      const params: CreateEntryV2Params = {
        provider_id: providerId, industry_key: industryKey, service_key: serviceKey,
        fee_breakdown: feeBreakdown, context, quote_transparency_score: quoteTransparencyScore,
      }
      if (initialQuoteTotal) params.initial_quote_total = parseFloat(initialQuoteTotal)
      if (finalTotalPaid) params.final_total_paid = parseFloat(finalTotalPaid)

      const result = await createEntryV2(params)
      if (!result.success) { setError(result.error || 'Submission failed'); setIsSubmitting(false); return }
      setSuccess(true)
      setTimeout(() => router.push(`/entries?industry=${industryKey}`), 3000)
    } catch (err) {
      setError('Network error, please try again')
      setIsSubmitting(false)
    }
  }

  if (schemaLoading) return (<div className="max-w-2xl mx-auto p-8 text-center"><div className="animate-pulse text-gray-500">Loading form schema...</div></div>)
  if (schemaError || !schema) return (<div className="max-w-2xl mx-auto p-8"><div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">Failed to load form configuration: {schemaError || 'Schema not found'}</div></div>)
  if (success) return (<div className="max-w-2xl mx-auto p-8"><div className="p-6 bg-green-50 border border-green-200 rounded-lg"><h2 className="text-xl font-bold text-green-800 mb-2">Submitted successfully</h2><p className="text-green-700">Thank you! Redirecting to entries list...</p></div></div>)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Share Fee Experience</h2>
        <p className="text-gray-500 mt-1">for <span className="font-semibold text-gray-700">{providerName}</span></p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <button type="button" onClick={() => step < currentStep && setCurrentStep(step)}
              className={`w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-colors ${step === currentStep ? 'bg-orange-600 text-white' : step < currentStep ? 'bg-green-100 text-green-700 cursor-pointer hover:bg-green-200' : 'bg-gray-100 text-gray-400'}`}>
              {step < currentStep ? '\u2713' : step}
            </button>
            {step < 4 && <div className={`w-12 h-0.5 ${step < currentStep ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <span className="ml-3 text-sm text-gray-500">
          {currentStep === 1 && 'Service & Pricing'}{currentStep === 2 && 'Fee Details'}{currentStep === 3 && 'Disbursements'}{currentStep === 4 && 'Additional Context'}
        </span>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* STEP 1: Service & Pricing */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Type *</label>
              <select value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                <option value="">Select service type...</option>
                {serviceOptions.map((opt) => (<option key={opt.key} value={opt.key}>{opt.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Jurisdiction *</label>
              <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                <option value="">Select state/territory...</option>
                {JURISDICTION_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Pricing Model *</label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.entries(PRICING_MODEL_LABELS) as [PricingModel, string][]).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${pricingModel === key ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="pricingModel" value={key} checked={pricingModel === key} onChange={() => setPricingModel(key)} className="w-4 h-4 text-orange-600 focus:ring-orange-500" />
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <button type="button" onClick={() => setCurrentStep(2)} disabled={!canProceedStep1()} className="px-6 py-2.5 bg-gray-900 text-white rounded-md font-medium hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">Next &rarr;</button>
            </div>
          </div>
        )}

        {/* STEP 2: Fee Details */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <h3 className="font-semibold text-gray-800">{PRICING_MODEL_LABELS[pricingModel as PricingModel]} Details</h3>
            {pricingModel === 'fixed' && (
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Fixed Fee Amount (AUD) *</label><input type="number" step="0.01" min="0" value={fixedFeeAmount} onChange={(e) => setFixedFeeAmount(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 1650" /></div>
            )}
            {(pricingModel === 'hourly' || pricingModel === 'blended') && (<>
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate (AUD) *</label><input type="number" step="1" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 350" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Hours {pricingModel === 'blended' ? '*' : '(optional)'}</label><input type="number" step="0.5" min="0" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 8" /></div>
            </>)}
            {pricingModel === 'retainer' && (
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Retainer Amount (AUD) *</label><input type="number" step="0.01" min="0" value={retainerAmount} onChange={(e) => setRetainerAmount(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 5000" /></div>
            )}
            {pricingModel === 'conditional' && (
              <div className="space-y-4">
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">Conditional / No Win No Fee pricing requires disclosure of either uplift percentage or contingency percentage.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Uplift %</label><input type="number" step="0.1" min="0" max="100" value={upliftPct} onChange={(e) => setUpliftPct(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 25" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Contingency %</label><input type="number" step="0.1" min="0" max="100" value={contingencyPct} onChange={(e) => setContingencyPct(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 30" /></div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={gstIncluded} onChange={(e) => setGstIncluded(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" /><span className="text-sm font-medium text-gray-700">Price includes GST</span></label>
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Total Estimated (AUD)</label><input type="number" step="0.01" min="0" value={totalEstimated} onChange={(e) => setTotalEstimated(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Total including disbursements" /></div>
            </div>
            <div className="pt-4 flex justify-between">
              <button type="button" onClick={() => setCurrentStep(1)} className="px-6 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">&larr; Back</button>
              <button type="button" onClick={() => setCurrentStep(3)} disabled={!canProceedStep2()} className="px-6 py-2.5 bg-gray-900 text-white rounded-md font-medium hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">Next &rarr;</button>
            </div>
          </div>
        )}

        {/* STEP 3: Disbursements */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Disbursements</h3>
              <p className="text-sm text-gray-500 mb-4">Add any third-party costs (court fees, government charges, etc.)</p>
              {disbursements.length > 0 && (
                <div className="space-y-2 mb-4">
                  {disbursements.map((d, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div><span className="font-medium text-gray-800">{d.label}</span>{d.is_estimate && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">estimate</span>}</div>
                      <div className="flex items-center gap-3"><span className="font-semibold text-gray-900">${d.amount.toLocaleString()}</span><button type="button" onClick={() => removeDisbursement(idx)} className="text-red-500 hover:text-red-700 text-sm">&times;</button></div>
                    </div>
                  ))}
                  <div className="text-right text-sm font-semibold text-gray-700 pt-1">Total: ${disbursementsTotal.toLocaleString()}</div>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1"><input type="text" value={newDisbLabel} onChange={(e) => setNewDisbLabel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" placeholder="Description (e.g. Court filing fee)" /></div>
                <div className="w-28"><input type="number" step="0.01" min="0" value={newDisbAmount} onChange={(e) => setNewDisbAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" placeholder="Amount" /></div>
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap"><input type="checkbox" checked={newDisbEstimate} onChange={(e) => setNewDisbEstimate(e.target.checked)} className="w-3 h-3 rounded" />Est.</label>
                <button type="button" onClick={addDisbursement} disabled={!newDisbLabel || !newDisbAmount} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 disabled:opacity-40">+ Add</button>
              </div>
            </div>
            <div className="pt-4 flex justify-between">
              <button type="button" onClick={() => setCurrentStep(2)} className="px-6 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">&larr; Back</button>
              <button type="button" onClick={() => setCurrentStep(4)} className="px-6 py-2.5 bg-gray-900 text-white rounded-md font-medium hover:bg-orange-600 transition-colors">Next &rarr;</button>
            </div>
          </div>
        )}

        {/* STEP 4: Context + Submit */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Additional Context</h3>
              <p className="text-sm text-gray-500 mb-4">Optional details that help others compare fees more accurately.</p>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Client Type</label>
                  <select value={(contextFields.client_type as string) || ''} onChange={(e) => updateContext('client_type', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                    <option value="">Select...</option><option value="individual">Individual</option><option value="business">Business</option><option value="trust">Trust</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Complexity</label>
                  <select value={(contextFields.complexity_band as string) || ''} onChange={(e) => updateContext('complexity_band', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                    <option value="">Select...</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                {recommendedContext.filter((key) => !['matter_type', 'jurisdiction', 'client_type', 'complexity_band'].includes(key)).map((key) => {
                  const prop = contextSchemaProps[key]
                  if (!prop) return null
                  return (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-1.5">{prop.title || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</label>{renderContextField(key, prop)}</div>)
                })}
              </div>
            </div>
            <div className="border-t pt-5">
              <h3 className="font-semibold text-gray-800 mb-3">Quote Comparison (optional)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Initial Quote Total (AUD)</label><input type="number" step="0.01" min="0" value={initialQuoteTotal} onChange={(e) => setInitialQuoteTotal(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Final Total Paid (AUD)</label><input type="number" step="0.01" min="0" value={finalTotalPaid} onChange={(e) => setFinalTotalPaid(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Transparency Score</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (<button key={score} type="button" onClick={() => setQuoteTransparencyScore(score)} className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${quoteTransparencyScore === score ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{score}</button>))}
                </div>
                <p className="mt-1 text-xs text-gray-500">1 = Not transparent at all, 5 = Very transparent</p>
              </div>
            </div>
            <div className="pt-4 flex justify-between border-t">
              <button type="button" onClick={() => setCurrentStep(3)} className="px-6 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">&larr; Back</button>
              <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-orange-600 text-white rounded-md font-semibold hover:bg-orange-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">{isSubmitting ? 'Submitting...' : 'Submit Fee Entry'}</button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
