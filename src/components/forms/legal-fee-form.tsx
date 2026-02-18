'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import {
  createEntryV2,
  type CreateEntryV2Params,
  type FeeBreakdown,
  type DisbursementItem,
} from '@/lib/supabase/functions'
import { getCurrentUser } from '@/lib/supabase/client.browser'
import { uploadEvidence, linkEvidenceToEntry } from '@/lib/supabase/rpc'
import { type PricingModel } from '@/lib/supabase/types'

import {
  useIndustrySchema,
  getServiceOptions,
  getRecommendedContextFields,
  getRequiredFieldsForPricingModel,
  type ServiceOption,
  type SchemaProperty,
} from '@/hooks/use-industry-schema'

interface LegalFeeFormProps {
  providerId: string
  providerName: string
  industryKey: string
}

type EvidenceState = 'idle' | 'uploading' | 'confirmed' | 'failed'

const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  hourly: 'Hourly',
  fixed: 'Fixed',
  capped: 'Capped',
  retainer: 'Retainer',
  contingency_pct: 'Contingency (%)',
  uplift: 'Uplift (%)',
  blended: 'Blended',
  other: 'Other',
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

const MAX_EVIDENCE_MB = 10
const ALLOWED_MIME: Array<'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'> = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

function humanise(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

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

  // Evidence
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidenceStatus, setEvidenceStatus] = useState<Record<string, EvidenceState>>({})
  const [confirmedEvidenceIds, setConfirmedEvidenceIds] = useState<string[]>([])
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const serviceOptions: ServiceOption[] = schema ? getServiceOptions(schema) : []
  const recommendedContext = schema && serviceKey ? getRecommendedContextFields(schema, serviceKey) : []
  const contextSchemaProps = schema?.context_schema?.properties || {}

  const disbursementsTotal = useMemo(
    () => disbursements.reduce((sum, d) => sum + (Number.isFinite(d.amount) ? d.amount : 0), 0),
    [disbursements]
  )

  function updateContext(key: string, value: string | number | boolean) {
    setContextFields((prev) => ({ ...prev, [key]: value }))
  }

  function renderContextField(key: string, prop: SchemaProperty) {
    const value = contextFields[key] ?? ''

    if (prop.enum) {
      return (
        <select
          value={value as string}
          onChange={(e) => updateContext(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">Select...</option>
          {prop.enum.map((v) => (
            <option key={v} value={v}>
              {v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      )
    }

    if (prop.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!contextFields[key]}
            onChange={(e) => updateContext(key, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-gray-700">Yes</span>
        </label>
      )
    }

    if (prop.type === 'number' || prop.type === 'integer') {
      return (
        <input
          type="number"
          value={value as string}
          onChange={(e) => updateContext(key, e.target.value ? parseFloat(e.target.value) : '')}
          min={prop.minimum}
          max={prop.maximum}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder={prop.description || ''}
        />
      )
    }

    return (
      <input
        type="text"
        value={value as string}
        onChange={(e) => updateContext(key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        placeholder={prop.description || ''}
      />
    )
  }

  function addDisbursement() {
    if (!newDisbLabel || !newDisbAmount) return
    const amt = parseFloat(newDisbAmount)
    if (!Number.isFinite(amt) || amt <= 0) return

    setDisbursements((prev) => [...prev, { label: newDisbLabel, amount: amt, is_estimate: newDisbEstimate }])
    setNewDisbLabel('')
    setNewDisbAmount('')
    setNewDisbEstimate(false)
  }

  function validateCurrentStep(step: number): string[] {
    const errs: string[] = []
    if (!schema) return errs

    if (step >= 1) {
      if (!serviceKey) errs.push('Please select a service.')
      if (!jurisdiction) errs.push('Please select a jurisdiction.')
    }

    if (step >= 2) {
      if (!pricingModel) {
        errs.push('Please select a pricing model.')
      } else {
        const required = getRequiredFieldsForPricingModel(schema, pricingModel)
        for (const field of required) {
          const v = ((): string => {
            switch (field) {
              case 'fixed_fee_amount':
                return fixedFeeAmount
              case 'hourly_rate':
                return hourlyRate
              case 'estimated_hours':
                return estimatedHours
              case 'retainer_amount':
                return retainerAmount
              case 'uplift_pct':
                return upliftPct
              case 'contingency_pct':
                return contingencyPct
              case 'total_estimated':
                return totalEstimated
              default:
                return ''
            }
          })()

          if (!v || !String(v).trim()) {
            errs.push(`${humanise(field)} is required.`)
          }
        }

        // numerical sanity
        const numericFields: Array<[string, string]> = [
          ['fixed_fee_amount', fixedFeeAmount],
          ['hourly_rate', hourlyRate],
          ['estimated_hours', estimatedHours],
          ['retainer_amount', retainerAmount],
          ['uplift_pct', upliftPct],
          ['contingency_pct', contingencyPct],
          ['total_estimated', totalEstimated],
        ]
        for (const [k, v] of numericFields) {
          if (!v) continue
          const n = parseFloat(v)
          if (!Number.isFinite(n)) errs.push(`${humanise(k)} must be a number.`)
          else if (n < 0) errs.push(`${humanise(k)} cannot be negative.`)
        }
      }

      // disbursements
      for (const d of disbursements) {
        if (!d.label?.trim()) errs.push('Each disbursement must have a label.')
        if (!Number.isFinite(d.amount) || d.amount <= 0) errs.push('Each disbursement amount must be greater than 0.')
      }

      // schema required context keys
      const requiredContextKeys: string[] = schema.context_schema?.required || []
      for (const key of requiredContextKeys) {
        const v = contextFields[key]
        if (v === undefined || v === '' || v === null) {
          const title = (contextSchemaProps as any)?.[key]?.title as string | undefined
          errs.push(`${title || humanise(key)} is required.`)
        }
      }
    }

    return errs
  }

  async function handleEvidenceFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    setEvidenceError(null)

    const next: File[] = []
    const nextStatus: Record<string, EvidenceState> = { ...evidenceStatus }

    for (const f of Array.from(files)) {
      if (!ALLOWED_MIME.includes(f.type as any)) {
        setEvidenceError('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.')
        continue
      }
      const sizeMb = f.size / (1024 * 1024)
      if (sizeMb > MAX_EVIDENCE_MB) {
        setEvidenceError(`File too large. Max ${MAX_EVIDENCE_MB}MB.`)
        continue
      }
      next.push(f)
      nextStatus[f.name] = 'idle'
    }

    if (next.length) {
      setEvidenceFiles((prev) => [...prev, ...next])
      setEvidenceStatus(nextStatus)
    }
  }

  async function uploadAndConfirmEvidence(file: File) {
    setEvidenceError(null)
    setEvidenceStatus((prev) => ({ ...prev, [file.name]: 'uploading' }))

    const res = await uploadEvidence({ file, mimeType: file.type as any })
    if (!res.success || !res.evidence_id) {
      setEvidenceStatus((prev) => ({ ...prev, [file.name]: 'failed' }))
      setEvidenceError(res.error || 'Evidence upload failed')
      return
    }

    setConfirmedEvidenceIds((prev) => (prev.includes(res.evidence_id as string) ? prev : [...prev, res.evidence_id as string]))
    setEvidenceStatus((prev) => ({ ...prev, [file.name]: 'confirmed' }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const validationErrors = validateCurrentStep(3)
    if (validationErrors.length) {
      setError(validationErrors.join(' '))
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const user = await getCurrentUser()
      if (!user) {
        setError('Please log in first')
        setIsSubmitting(false)
        return
      }

      const feeBreakdown: FeeBreakdown = {
        pricing_model: pricingModel as PricingModel,
        gst_included: gstIncluded,
      }

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

      const context: Record<string, unknown> = {
        matter_type: serviceKey,
        jurisdiction,
        ...contextFields,
      }

      const params: CreateEntryV2Params = {
        provider_id: providerId,
        industry_key: industryKey,
        service_key: serviceKey,
        fee_breakdown: feeBreakdown,
        context,
        quote_transparency_score: quoteTransparencyScore,
      }

      if (initialQuoteTotal) params.initial_quote_total = parseFloat(initialQuoteTotal)
      if (finalTotalPaid) params.final_total_paid = parseFloat(finalTotalPaid)

      const result = await createEntryV2(params)

      if (!result.success) {
        setError(result.error || 'Submission failed')
        setIsSubmitting(false)
        return
      }

      const createdEntryId: string | undefined = (result as any).entry_id || (result as any).entryId || (result as any).id

      // link evidence (best-effort)
      if (createdEntryId && confirmedEvidenceIds.length) {
        for (const evId of confirmedEvidenceIds) {
          const link = await linkEvidenceToEntry({ evidence_id: evId, entry_id: createdEntryId })
          if (!link.success) {
            setEvidenceError(link.error || 'Evidence linking failed')
            break
          }
        }
      }

      setSuccess(true)
      setTimeout(() => router.push(`/entries?industry=${industryKey}`), 1500)
    } catch (err) {
      console.error(err)
      setError('Network error, please try again')
      setIsSubmitting(false)
    }
  }

  if (schemaLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="animate-pulse text-gray-500">Loading form schema...</div>
      </div>
    )
  }

  if (schemaError || !schema) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Failed to load form configuration: {schemaError || 'Schema not found'}
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <h2 className="text-xl font-bold text-green-800 mb-2">Submitted successfully</h2>
          <p className="text-green-700">Thank you! Redirecting to entries list...</p>
        </div>
      </div>
    )
  }

  // UI below: keep your existing step UI; I only add the Evidence block in step 3.
  // NOTE: This file intentionally stays close to your existing form layout.

  const canProceedStep1 = !!serviceKey && !!jurisdiction
  const canProceedStep2 = !!pricingModel

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Share Fee Experience</h2>
        <p className="text-gray-500 mt-1">
          for <span className="font-semibold text-gray-700">{providerName}</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={currentStep === 1 ? 'font-semibold text-gray-900' : ''}>1. Service</span>
          <span>›</span>
          <span className={currentStep === 2 ? 'font-semibold text-gray-900' : ''}>2. Pricing</span>
          <span>›</span>
          <span className={currentStep === 3 ? 'font-semibold text-gray-900' : ''}>3. Details</span>
          <span>›</span>
          <span className={currentStep === 4 ? 'font-semibold text-gray-900' : ''}>4. Review</span>
        </div>

        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
              <select
                value={serviceKey}
                onChange={(e) => setServiceKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value="">Select a service...</option>
                {serviceOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jurisdiction</label>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value="">Select...</option>
                {JURISDICTION_OPTIONS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canProceedStep1}
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 rounded-md bg-orange-600 text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pricing model</label>
              <select
                value={pricingModel}
                onChange={(e) => setPricingModel(e.target.value as PricingModel)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value="">Select...</option>
                {(Object.keys(PRICING_MODEL_LABELS) as PricingModel[]).map((m) => (
                  <option key={m} value={m}>
                    {PRICING_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="gst"
                type="checkbox"
                checked={gstIncluded}
                onChange={(e) => setGstIncluded(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="gst" className="text-sm text-gray-700">
                GST included
              </label>
            </div>

            <div className="flex justify-between">
              <button type="button" onClick={() => setCurrentStep(1)} className="px-4 py-2 rounded-md border">
                Back
              </button>
              <button
                type="button"
                disabled={!canProceedStep2}
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 rounded-md bg-orange-600 text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* Pricing fields (you can keep expanding this section; kept minimal here) */}
            <div className="grid grid-cols-1 gap-4">
              {pricingModel === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fixed fee amount</label>
                  <input
                    type="number"
                    value={fixedFeeAmount}
                    onChange={(e) => setFixedFeeAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}

              {(pricingModel === 'hourly' || pricingModel === 'blended') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hourly rate</label>
                    <input
                      type="number"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated hours</label>
                    <input
                      type="number"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </>
              )}

              {pricingModel === 'retainer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retainer amount</label>
                  <input
                    type="number"
                    value={retainerAmount}
                    onChange={(e) => setRetainerAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}

              {pricingModel === 'contingency_pct' && (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contingency %</label>
                    <input
                      type="number"
                      value={contingencyPct}
                      onChange={(e) => setContingencyPct(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Uplift %</label>
                    <input
                      type="number"
                      value={upliftPct}
                      onChange={(e) => setUpliftPct(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total estimated (if known)</label>
                <input
                  type="number"
                  value={totalEstimated}
                  onChange={(e) => setTotalEstimated(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {/* Disbursements */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="font-medium text-gray-900">Disbursements (optional)</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newDisbLabel}
                  onChange={(e) => setNewDisbLabel(e.target.value)}
                  placeholder="e.g., Filing fee"
                  className="px-3 py-2 border rounded-md"
                />
                <input
                  type="number"
                  value={newDisbAmount}
                  onChange={(e) => setNewDisbAmount(e.target.value)}
                  placeholder="Amount"
                  className="px-3 py-2 border rounded-md"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={newDisbEstimate} onChange={(e) => setNewDisbEstimate(e.target.checked)} />
                  Estimate
                </label>
              </div>
              <button type="button" onClick={addDisbursement} className="px-3 py-2 border rounded-md">
                Add
              </button>

              {disbursements.length > 0 && (
                <div className="space-y-2">
                  {disbursements.map((d, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <div>
                        {d.label} {d.is_estimate ? '(est.)' : ''}
                      </div>
                      <div>${d.amount.toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="pt-2 border-t text-sm font-medium flex justify-between">
                    <div>Total</div>
                    <div>${disbursementsTotal.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Context fields (recommended) */}
            {recommendedContext.length > 0 && (
              <div className="border rounded-lg p-4 space-y-4">
                <div className="font-medium text-gray-900">Case context</div>
                {recommendedContext.map((k) => {
                  const prop = (contextSchemaProps as any)[k] as SchemaProperty | undefined
                  if (!prop) return null
                  return (
                    <div key={k}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{prop.title || humanise(k)}</label>
                      {renderContextField(k, prop)}
                      {prop.description && <div className="text-xs text-gray-500 mt-1">{prop.description}</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Evidence upload */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="font-medium text-gray-900">Evidence (optional)</div>
              <div className="text-xs text-gray-500">Upload invoices, quotes, or receipts (JPG/PNG/WEBP/PDF, ≤ {MAX_EVIDENCE_MB}MB)</div>

              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleEvidenceFilesSelected(e.target.files)}
              />

              {evidenceError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{evidenceError}</div>
              )}

              {evidenceFiles.length > 0 && (
                <div className="space-y-2">
                  {evidenceFiles.map((f) => (
                    <div key={f.name} className="flex items-center justify-between gap-3 text-sm">
                      <div className="truncate">{f.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{evidenceStatus[f.name] || 'idle'}</span>
                        <button
                          type="button"
                          disabled={(evidenceStatus[f.name] || 'idle') === 'uploading' || (evidenceStatus[f.name] || 'idle') === 'confirmed'}
                          onClick={() => uploadAndConfirmEvidence(f)}
                          className="px-3 py-1 border rounded-md disabled:opacity-50"
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {confirmedEvidenceIds.length > 0 && (
                <div className="text-xs text-gray-600">Confirmed: {confirmedEvidenceIds.length} file(s)</div>
              )}
            </div>

            <div className="flex justify-between">
              <button type="button" onClick={() => setCurrentStep(2)} className="px-4 py-2 rounded-md border">
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 rounded-md bg-orange-600 text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-2 text-sm">
              <div><span className="font-medium">Service:</span> {serviceKey || '-'}</div>
              <div><span className="font-medium">Jurisdiction:</span> {jurisdiction || '-'}</div>
              <div><span className="font-medium">Pricing model:</span> {pricingModel ? PRICING_MODEL_LABELS[pricingModel as PricingModel] : '-'}</div>
              <div><span className="font-medium">Evidence:</span> {confirmedEvidenceIds.length} confirmed</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial quote total (if known)</label>
              <input type="number" value={initialQuoteTotal} onChange={(e) => setInitialQuoteTotal(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Final total paid (if known)</label>
              <input type="number" value={finalTotalPaid} onChange={(e) => setFinalTotalPaid(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quote transparency score (1–5)</label>
              <input type="range" min={1} max={5} value={quoteTransparencyScore} onChange={(e) => setQuoteTransparencyScore(parseInt(e.target.value, 10))} className="w-full" />
              <div className="text-xs text-gray-500">{quoteTransparencyScore}</div>
            </div>

            <div className="flex justify-between">
              <button type="button" onClick={() => setCurrentStep(3)} className="px-4 py-2 rounded-md border">
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-orange-600 text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
