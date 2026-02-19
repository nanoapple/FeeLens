// src/lib/errors.ts
// ==========================================
// FeeLens — Structured Error System
//
// Error code is the PRIMARY mapping key for user-facing messages.
// String matching is ONLY a fallback for unmapped legacy errors.
//
// Usage:
//   import { classifyError, ERROR_MESSAGES, type ApiError } from '@/lib/errors'
//   const apiError = classifyError(result)
//   <ApiErrorDisplay error={apiError} />
// ==========================================

/**
 * Structured error returned by Edge Functions and consumed by UI.
 */
export interface ApiError {
  /** Machine-readable code — primary key for i18n/display */
  code: ErrorCode
  /** Human-readable message for the user */
  message: string
  /** Per-field errors from Zod validation (field path → message) */
  fieldErrors?: Record<string, string>
  /** Seconds until the user can retry (for rate limits) */
  retryAfterSeconds?: number
  /** Raw error for dev console only */
  raw?: string
}

/**
 * All known error codes. Edge Functions should return these in `error_code`.
 * RPC string errors are mapped here via `classifyError()`.
 */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_NOT_APPROVED'
  | 'RATE_LIMIT_DAILY'
  | 'RATE_LIMIT_PROVIDER'
  | 'SCHEMA_NOT_FOUND'
  | 'SCHEMA_INACTIVE'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

/**
 * User-facing messages keyed by ErrorCode.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED:
    'Please sign in to continue.',
  PROVIDER_NOT_FOUND:
    'This service provider was not found. Please check the link and try again.',
  PROVIDER_NOT_APPROVED:
    'This provider is pending verification. Entries can only be submitted for verified providers.',
  RATE_LIMIT_DAILY:
    'You\'ve reached the daily submission limit (3 entries per 24 hours). Please try again later.',
  RATE_LIMIT_PROVIDER:
    'You\'ve reached the annual limit for this provider (5 entries per year).',
  SCHEMA_NOT_FOUND:
    'This industry type is not yet supported. Please contact support.',
  SCHEMA_INACTIVE:
    'This industry category is temporarily unavailable.',
  VALIDATION_FAILED:
    'Some fields need to be corrected. Please review the highlighted errors below.',
  INTERNAL_ERROR:
    'Something went wrong on our end. Please try again in a moment.',
  NETWORK_ERROR:
    'Unable to connect. Please check your internet and try again.',
  UNKNOWN:
    'An unexpected error occurred. Please try again.',
}

/**
 * RPC error string → ErrorCode mapping.
 * Order matters: first match wins. Patterns are case-insensitive substrings.
 *
 * This is the FALLBACK. Edge Functions should return `error_code` directly.
 */
const RPC_ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCode }> = [
  { pattern: /not authenticated|unauthorized|请先登录/i, code: 'AUTH_REQUIRED' },
  { pattern: /provider not found/i,                       code: 'PROVIDER_NOT_FOUND' },
  { pattern: /not yet approved|not approved/i,             code: 'PROVIDER_NOT_APPROVED' },
  { pattern: /24.*(小时|hours?).*超过|daily.?limit/i,       code: 'RATE_LIMIT_DAILY' },
  { pattern: /该商家.*超过|provider.*year/i,                code: 'RATE_LIMIT_PROVIDER' },
  { pattern: /schema not found|industry.*not found/i,      code: 'SCHEMA_NOT_FOUND' },
  { pattern: /schema.*(inactive|is inactive)/i,            code: 'SCHEMA_INACTIVE' },
  { pattern: /validation failed/i,                         code: 'VALIDATION_FAILED' },
  { pattern: /internal server error/i,                     code: 'INTERNAL_ERROR' },
]

/**
 * Parse a Zod `details` array (from Edge Function 400 response)
 * into a fieldErrors map.
 *
 * Input format: ["fee_breakdown.hourly_rate: Expected number", ...]
 */
function parseZodDetails(details: unknown): Record<string, string> | undefined {
  if (!Array.isArray(details)) return undefined
  const fieldErrors: Record<string, string> = {}
  for (const item of details) {
    if (typeof item !== 'string') continue
    const colonIdx = item.indexOf(': ')
    if (colonIdx > 0) {
      fieldErrors[item.slice(0, colonIdx)] = item.slice(colonIdx + 2)
    } else {
      fieldErrors['_general'] = item
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

/**
 * Classify an API response into a structured ApiError.
 *
 * Accepts the raw response object from Edge Functions / RPC helpers.
 * Priority: error_code (structured) > string pattern matching (fallback).
 */
export function classifyError(response: {
  success?: boolean
  error?: string
  error_code?: ErrorCode
  details?: unknown
  retry_after_seconds?: number
}): ApiError {
  // 1. If Edge Function already returned a structured error_code, use it directly
  if (response.error_code && response.error_code in ERROR_MESSAGES) {
    const code = response.error_code
    return {
      code,
      message: ERROR_MESSAGES[code],
      fieldErrors: code === 'VALIDATION_FAILED' ? parseZodDetails(response.details) : undefined,
      retryAfterSeconds: response.retry_after_seconds,
      raw: response.error,
    }
  }

  // 2. Fallback: match RPC error string patterns
  const errorStr = response.error || ''
  for (const { pattern, code } of RPC_ERROR_PATTERNS) {
    if (pattern.test(errorStr)) {
      return {
        code,
        message: ERROR_MESSAGES[code],
        fieldErrors: code === 'VALIDATION_FAILED' ? parseZodDetails(response.details) : undefined,
        retryAfterSeconds: response.retry_after_seconds,
        raw: errorStr,
      }
    }
  }

  // 3. Network-level errors (no response body)
  if (!response.error && !response.success) {
    return {
      code: 'NETWORK_ERROR',
      message: ERROR_MESSAGES.NETWORK_ERROR,
    }
  }

  // 4. Truly unknown
  return {
    code: 'UNKNOWN',
    message: ERROR_MESSAGES.UNKNOWN,
    raw: errorStr,
  }
}
