// src/app/(auth)/login/page.tsx
// ==========================================
// Auth-1: Login Page
//
// Supports:
//   - Email + Password sign-in (primary, works with Supabase local dev)
//   - Email Magic Link / OTP (secondary, toggle-able)
//   - callbackUrl: redirects back after login (e.g. /admin/moderation)
//   - Fallback: if no callbackUrl, redirect to /
//
// Security notes:
//   - No writes to DB from this page (auth is handled by Supabase Auth)
//   - callbackUrl is validated to be a relative path (no open redirect)
// ==========================================

'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client.browser'

type AuthMode = 'password' | 'magic-link'

/**
 * Validate callbackUrl is a safe relative path.
 * Prevents open redirect attacks.
 */
function getSafeCallbackUrl(raw: string | null): string {
  if (!raw) return '/'
  // Must start with / and not contain protocol
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return '/'
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = getSafeCallbackUrl(searchParams.get('callbackUrl'))

  const [mode, setMode] = useState<AuthMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Check if user is already logged in
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace(callbackUrl)
      } else {
        setCheckingSession(false)
      }
    })
  }, [router, callbackUrl])

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password.')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Please confirm your email address first.')
        } else {
          setError(authError.message)
        }
        return
      }

      // Success — navigate to callback
      router.replace(callbackUrl)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
        },
      })

      if (authError) {
        setError(authError.message)
        return
      }

      setMagicLinkSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Show nothing while checking existing session
  if (checkingSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAFAF8',
        }}
      >
        <div style={{ color: '#888', fontSize: '0.9rem' }}>Checking session...</div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAFAF8',
        padding: '2rem',
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <a
            href="/"
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#1a1a1a',
              textDecoration: 'none',
            }}
          >
            Fee<span style={{ color: '#E8590C' }}>Lens</span>
          </a>
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.9rem',
              color: '#888',
            }}
          >
            Sign in to continue
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: 16,
            padding: '2rem',
          }}
        >
          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: '1.5rem',
              background: '#f5f5f3',
              borderRadius: 10,
              padding: 3,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('password')
                setError('')
                setMagicLinkSent(false)
              }}
              style={{
                flex: 1,
                padding: '0.55rem 0',
                borderRadius: 8,
                border: 'none',
                background: mode === 'password' ? '#fff' : 'transparent',
                color: mode === 'password' ? '#1a1a1a' : '#888',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: mode === 'password' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('magic-link')
                setError('')
              }}
              style={{
                flex: 1,
                padding: '0.55rem 0',
                borderRadius: 8,
                border: 'none',
                background: mode === 'magic-link' ? '#fff' : 'transparent',
                color: mode === 'magic-link' ? '#1a1a1a' : '#888',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: mode === 'magic-link' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Magic Link
            </button>
          </div>

          {/* Magic link success state */}
          {magicLinkSent ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✉️</div>
              <h3
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: '#1a1a1a',
                  marginBottom: '0.5rem',
                }}
              >
                Check your email
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#888', lineHeight: 1.5 }}>
                We sent a login link to{' '}
                <strong style={{ color: '#1a1a1a' }}>{email}</strong>.
                <br />
                Click the link to sign in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMagicLinkSent(false)
                  setEmail('')
                }}
                style={{
                  marginTop: '1.5rem',
                  padding: '0.5rem 1.25rem',
                  background: 'transparent',
                  border: '1.5px solid #ddd',
                  borderRadius: 100,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#666',
                  cursor: 'pointer',
                }}
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form
              onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}
            >
              {/* Email */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#444',
                    marginBottom: '0.4rem',
                  }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    border: '1.5px solid #e0e0e0',
                    borderRadius: 10,
                    fontSize: '0.92rem',
                    color: '#1a1a1a',
                    background: '#fff',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#E8590C'
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px rgba(232, 89, 12, 0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e0e0e0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Password (only in password mode) */}
              {mode === 'password' && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label
                    htmlFor="password"
                    style={{
                      display: 'block',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#444',
                      marginBottom: '0.4rem',
                    }}
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.9rem',
                      border: '1.5px solid #e0e0e0',
                      borderRadius: 10,
                      fontSize: '0.92rem',
                      color: '#1a1a1a',
                      background: '#fff',
                      outline: 'none',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#E8590C'
                      e.currentTarget.style.boxShadow =
                        '0 0 0 3px rgba(232, 89, 12, 0.08)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e0e0e0'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  style={{
                    padding: '0.65rem 0.85rem',
                    background: '#FDE8E8',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    color: '#B91C1C',
                    marginBottom: '1rem',
                    lineHeight: 1.4,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: loading ? '#999' : '#1a1a1a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s, transform 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = '#E8590C'
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = '#1a1a1a'
                }}
              >
                {loading
                  ? 'Signing in...'
                  : mode === 'password'
                    ? 'Sign in'
                    : 'Send magic link'}
              </button>
            </form>
          )}
        </div>

        {/* Callback URL hint (dev only) */}
        {callbackUrl !== '/' && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.6rem 0.85rem',
              background: 'rgba(232, 89, 12, 0.06)',
              borderRadius: 8,
              fontSize: '0.75rem',
              color: '#B85C00',
              textAlign: 'center',
            }}
          >
            You&rsquo;ll be redirected to{' '}
            <code
              style={{
                background: 'rgba(0,0,0,0.06)',
                padding: '0.15rem 0.35rem',
                borderRadius: 4,
                fontSize: '0.72rem',
              }}
            >
              {callbackUrl}
            </code>{' '}
            after login
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.78rem',
            color: '#bbb',
          }}
        >
          <a href="/" style={{ color: '#888', textDecoration: 'none' }}>
            ← Back to FeeLens
          </a>
        </div>
      </div>
    </div>
  )
}
