// src/components/home/home-client.tsx
// ==========================================
// FeeLens — Home Client Component (v1.1)
//
// Fixes from review:
//   P1: Removed unused recentReports prop
//   P1: Popular links use Next <Link> (no full page refresh)
// ==========================================

'use client'

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PopularLink } from '@/types/home'

// ===== INDUSTRY TABS =====

const INDUSTRIES = [
  { key: 'real_estate', label: 'Property' },
  { key: 'auto_repair', label: 'Auto Repair' },
  { key: 'construction', label: 'Construction' },
  { key: 'legal_services', label: 'Legal' },
  { key: 'business_services', label: 'Business' },
  { key: 'financial_services', label: 'Financial' },
  { key: 'education', label: 'Education' },
  { key: 'used_cars', label: 'Used Cars' },
  { key: 'saas', label: 'SaaS' },
  { key: 'healthcare', label: 'Healthcare' },
] as const

const PLACEHOLDERS: Record<string, string> = {
  real_estate: 'Search by suburb, postcode, or agency name…',
  auto_repair: 'Search by suburb, postcode, or workshop name…',
  construction: 'Search by suburb, postcode, or builder name…',
  legal_services: 'Search by suburb, postcode, or firm name…',
  business_services: 'Search by suburb, postcode, or company name…',
  financial_services: 'Search by suburb, postcode, or adviser name…',
  education: 'Search by suburb, postcode, or institution name…',
  used_cars: 'Search by suburb, postcode, or dealer name…',
  saas: 'Search by product name or company…',
  healthcare: 'Search by suburb, postcode, or practice name…',
}

// ===== ROTATING FEE =====

const SURPRISE_FEES = [
  '"Card payment surcharge — 1.5%"',
  '"Late payment admin fee — $55"',
  '"After-hours call-out — $180"',
  '"Lease renewal processing — $220"',
  '"Disbursement fee — $340"',
  '"Emergency service premium — 40%"',
  '"Annual account maintenance — $120"',
  '"Cancellation fee — $500"',
]

// ===== COMPONENT =====

interface HomeClientProps {
  popular: PopularLink[]
}

export function HomeClient({ popular }: HomeClientProps) {
  const router = useRouter()

  // ── Hero animation ──
  const [heroLoaded, setHeroLoaded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 80)
    return () => clearTimeout(t)
  }, [])

  // ── Rotating fee ──
  const [feeIdx, setFeeIdx] = useState(0)
  const [feeVisible, setFeeVisible] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => {
      setFeeVisible(false)
      setTimeout(() => {
        setFeeIdx((i) => (i + 1) % SURPRISE_FEES.length)
        setFeeVisible(true)
      }, 400)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  // ── Search state ──
  const [activeIndustry, setActiveIndustry] = useState('real_estate')
  const [query, setQuery] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)

  // ── Search submit → routes to /entries ──
  const handleSearch = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const params = new URLSearchParams()
    if (activeIndustry) params.set('industry', activeIndustry)
    if (query.trim()) params.set('q', query.trim())
    router.push(`/entries?${params.toString()}`)
  }

  return (
    <section className="fl-hero">
      <div
        className="fl-hero-inner"
        style={{
          opacity: heroLoaded ? 1 : 0,
          transform: heroLoaded ? 'translateY(0)' : 'translateY(24px)',
          transition: 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="fl-hero-badge">
          Covering 10 industries across Australia
        </div>

        <h1>
          Know what you&rsquo;re
          <br />
          <span className="fl-accent">actually paying.</span>
        </h1>

        <p className="fl-hero-sub">
          Australians share real fees — the good, the bad, and the hidden — so
          you can compare, negotiate, and get a fair deal in any industry.
        </p>

        <div className="fl-rotating-fee">
          Surprise fee of the day:{' '}
          <span
            style={{
              color: 'var(--accent)',
              fontStyle: 'italic',
              opacity: feeVisible ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            {SURPRISE_FEES[feeIdx]}
          </span>
        </div>

        {/* Search block */}
        <form className="fl-search-block" onSubmit={handleSearch}>
          <div className="fl-search-tabs" ref={tabsRef}>
            {INDUSTRIES.map((ind) => (
              <button
                key={ind.key}
                type="button"
                className={`fl-search-tab ${activeIndustry === ind.key ? 'active' : ''}`}
                onClick={() => setActiveIndustry(ind.key)}
              >
                <span className="fl-search-tab-label">{ind.label}</span>
              </button>
            ))}
          </div>

          <div className="fl-search-box">
            <span className="fl-search-icon">🔍</span>
            <input
              type="text"
              placeholder={PLACEHOLDERS[activeIndustry] ?? 'Search…'}
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setQuery(e.target.value)
              }
            />
            <button type="submit" className="fl-search-btn">
              Search
            </button>
          </div>

          {popular.length > 0 && (
            <div className="fl-search-hint">
              <strong>Popular:</strong>
              {popular.map((p) => (
                <Link key={p.href} href={p.href}>
                  {p.label}
                </Link>
              ))}
            </div>
          )}
        </form>
      </div>
    </section>
  )
}
