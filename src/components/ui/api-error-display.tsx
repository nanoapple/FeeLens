// src/components/ui/api-error-display.tsx
// ==========================================
// Unified error display for all FeeLens forms and pages.
//
// Accepts an ApiError and renders:
//   - Banner (top of form) with human-readable message
//   - Field-level errors (inline, via fieldErrors map)
//   - Rate limit countdown (if retryAfterSeconds is set)
//   - Raw error in dev console only
//
// Usage:
//   import { ApiErrorDisplay, FieldError } from '@/components/ui/api-error-display'
//   <ApiErrorDisplay error={apiError} onDismiss={() => setError(null)} />
//   <FieldError fieldPath="fee_breakdown.hourly_rate" error={apiError} />
// ==========================================

'use client'

import { useEffect, useState } from 'react'
import type { ApiError } from '@/lib/errors'

// ── Banner styles by error severity ──────────────────────────────────────────

const BANNER_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: '⚠',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: '✕',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: 'ℹ',
  },
}

function getSeverity(code: string): 'warning' | 'error' | 'info' {
  if (code === 'RATE_LIMIT_DAILY' || code === 'RATE_LIMIT_PROVIDER') return 'warning'
  if (code === 'PROVIDER_NOT_APPROVED' || code === 'PROVIDER_NOT_FOUND') return 'warning'
  if (code === 'AUTH_REQUIRED') return 'info'
  return 'error'
}

// ── Countdown hook for rate limits ───────────────────────────────────────────

function useCountdown(seconds: number | undefined): string | null {
  const [remaining, setRemaining] = useState(seconds ?? 0)

  useEffect(() => {
    if (!seconds || seconds <= 0) return
    setRemaining(seconds)
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds])

  if (!seconds || remaining <= 0) return null
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// ── Main banner component ────────────────────────────────────────────────────

interface ApiErrorDisplayProps {
  error: ApiError | null
  onDismiss?: () => void
  className?: string
}

export function ApiErrorDisplay({ error, onDismiss, className = '' }: ApiErrorDisplayProps) {
  if (!error) return null

  const severity = getSeverity(error.code)
  const style = BANNER_STYLES[severity]
  const countdown = useCountdown(error.retryAfterSeconds)

  // Log raw error in development only
  if (process.env.NODE_ENV === 'development' && error.raw) {
    console.error('[FeeLens API Error]', error.code, error.raw)
  }

  const hasFieldErrors = error.fieldErrors && Object.keys(error.fieldErrors).length > 0

  return (
    <div
      className={`p-4 rounded-lg border ${style.bg} ${style.border} ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className={`text-lg flex-shrink-0 ${style.text}`}>{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${style.text}`}>
            {error.message}
          </p>

          {countdown && (
            <p className={`text-xs mt-1 ${style.text} opacity-75`}>
              You can try again in {countdown}
            </p>
          )}

          {hasFieldErrors && (
            <ul className="mt-2 space-y-1">
              {Object.entries(error.fieldErrors!).map(([field, msg]) => (
                <li key={field} className="text-xs text-red-600">
                  <code className="font-mono bg-red-100 px-1 rounded text-[11px]">
                    {humanizeFieldPath(field)}
                  </code>
                  {' — '}{msg}
                </li>
              ))}
            </ul>
          )}
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`flex-shrink-0 ${style.text} opacity-50 hover:opacity-100 transition-opacity`}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inline field error ───────────────────────────────────────────────────────

interface FieldErrorProps {
  fieldPath: string
  error: ApiError | null
}

/**
 * Inline field-level error display.
 * Place next to form inputs. Only renders if ApiError.fieldErrors contains this path.
 *
 * Example:
 *   <input name="hourly_rate" ... />
 *   <FieldError fieldPath="fee_breakdown.hourly_rate" error={apiError} />
 */
export function FieldError({ fieldPath, error }: FieldErrorProps) {
  if (!error?.fieldErrors?.[fieldPath]) return null

  return (
    <p className="mt-1 text-xs text-red-600">
      {error.fieldErrors[fieldPath]}
    </p>
  )
}

// ── Success display (for requires_moderation feedback) ───────────────────────

interface SubmitSuccessProps {
  requiresModeration: boolean
  className?: string
}

/**
 * Post-submit success feedback.
 * Shows different message based on whether entry needs moderation.
 */
export function SubmitSuccess({ requiresModeration, className = '' }: SubmitSuccessProps) {
  return (
    <div className={`p-6 rounded-lg border ${className}`}>
      <div className={`${requiresModeration ? 'bg-green-50 border-green-200' : 'bg-green-50 border-green-200'} p-6 rounded-lg border`}>
        <h2 className="text-xl font-bold text-green-800 mb-2">
          ✓ Entry submitted successfully
        </h2>
        <p className="text-green-700">
          {requiresModeration
            ? 'Your entry is under review and will appear publicly once approved. You can track its status in your entries.'
            : 'Your entry is now live. Thank you for contributing to fee transparency!'}
        </p>
        <p className="text-sm text-green-600 mt-2">
          Redirecting to your entries...
        </p>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert "fee_breakdown.hourly_rate" → "Hourly Rate"
 */
function humanizeFieldPath(path: string): string {
  // Take the last segment (most specific)
  const segment = path.includes('.') ? path.split('.').pop()! : path
  return segment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
