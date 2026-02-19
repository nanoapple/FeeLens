'use client'

import { useState, useEffect, useCallback } from 'react'

// ==========================================
// FeeLens Landing Page — Multi-Industry
// Aesthetic: Sharp minimal with warm Australian tones
// Target: Anyone tired of opaque fees across any industry
// ==========================================

// ===== DATA =====

const SEARCH_TABS = [
  { id: 'property', icon: '🏠', label: 'Property', placeholder: 'Search by suburb, postcode, or agency name...' },
  { id: 'auto', icon: '🚗', label: 'Auto', placeholder: 'Search by suburb, workshop name, or car brand...' },
  { id: 'construction', icon: '🔨', label: 'Reno', placeholder: 'Search by trade, suburb, or builder name...' },
  { id: 'legal', icon: '⚖️', label: 'Legal', placeholder: 'Search by practice area, suburb, or firm name...' },
  { id: 'health', icon: '🩺', label: 'Health', placeholder: 'Search by specialty, suburb, or clinic name...' },
  { id: 'more', icon: '＋', label: 'More', placeholder: 'Search across all industries...' },
]

const ROTATING_FEES = [
  'Annual statement fee — $85',
  'Card payment surcharge — 1.5%',
  'Maintenance coordination markup — 15%',
  'Diagnostic fee — $120 (not applied to repair)',
  'Conveyancing disbursements — $900 undisclosed',
  'Builder variation clause — uncapped',
  'Specialist gap fee — $185 surprise',
  'SaaS price hike — 40% after Year 1',
  'Advertising fee for re-letting — $350',
  'After-hours call-out fee — $95',
]

const INDUSTRIES_MAIN = [
  { icon: '🏠', name: 'Property\nManagement', count: '2,400+ reports' },
  { icon: '🚗', name: 'Auto Repair\n& Service', count: '1,850+ reports' },
  { icon: '🔨', name: 'Construction\n& Renovation', count: '1,200+ reports' },
  { icon: '⚖️', name: 'Legal\nServices', count: '980+ reports' },
  { icon: '🩺', name: 'Private\nHealthcare', count: '760+ reports' },
]

const INDUSTRIES_SECONDARY = [
  { icon: '💼', name: 'Business Services' },
  { icon: '💰', name: 'Financial Services' },
  { icon: '🎓', name: 'Education' },
  { icon: '🚙', name: 'Second-hand Cars' },
  { icon: '☁️', name: 'SaaS Subscriptions' },
]

const SAMPLE_REPORTS: ReportData[] = [
  {
    industry: 'property',
    industryLabel: '🏠 Property',
    time: '2 hours ago',
    title: 'Hidden "maintenance coordination" markup — 18%',
    body: 'Was charged a coordination fee on top of every maintenance job. Never disclosed in the original contract. Actual plumber cost was $320, I paid $378.',
    tag: 'negative',
    tagLabel: '⚠️ Hidden fee',
    location: '📍 Parramatta, NSW 2150',
    votes: 24,
  },
  {
    industry: 'auto',
    industryLabel: '🚗 Auto',
    time: '5 hours ago',
    title: 'Honest quote, fair price — brake pad replacement',
    body: 'Quoted $480 for front brake pads + machining. Final bill was exactly $480 including GST. Workshop even showed me the old pads. Would go back.',
    tag: 'positive',
    tagLabel: '✓ Fair deal',
    location: '📍 Brunswick, VIC 3056',
    votes: 41,
  },
  {
    industry: 'legal',
    industryLabel: '⚖️ Legal',
    time: '1 day ago',
    title: 'Conveyancing quoted $1,200, ended up $2,100',
    body: 'The base fee was as quoted but "disbursements" added $900 — title search, PEXA fees, and admin charges that were never mentioned up front.',
    tag: 'negative',
    tagLabel: '⚠️ Quote exceeded',
    location: '📍 Adelaide, SA 5000',
    votes: 38,
  },
  {
    industry: 'construction',
    industryLabel: '🔨 Construction',
    time: '1 day ago',
    title: 'Bathroom reno — builder was upfront about every cost',
    body: 'Full bathroom renovation for $18,500. Builder provided itemised breakdown before starting. Only $200 variation for unexpected waterproofing, explained with photos.',
    tag: 'positive',
    tagLabel: '✓ Transparent',
    location: '📍 Indooroopilly, QLD 4068',
    votes: 56,
  },
  {
    industry: 'healthcare',
    industryLabel: '🩺 Healthcare',
    time: '2 days ago',
    title: 'Specialist appointment gap fee not disclosed',
    body: 'Referred to a dermatologist — reception said "you\'ll have a small gap." The gap turned out to be $185 on top of the Medicare rebate. No prior written estimate.',
    tag: 'negative',
    tagLabel: '⚠️ Undisclosed gap',
    location: '📍 Subiaco, WA 6008',
    votes: 33,
  },
  {
    industry: 'education',
    industryLabel: '🎓 Education',
    time: '3 days ago',
    title: 'Tutoring centre — clear pricing and no lock-in',
    body: 'Quoted $65/hr for Year 12 maths. No enrolment fee, no material fee, and they let us pause during school holidays at no charge. Refreshingly honest.',
    tag: 'positive',
    tagLabel: '✓ Great value',
    location: '📍 Box Hill, VIC 3128',
    votes: 29,
  },
]

const STATS = [
  { number: '8,200+', label: 'Fee reports' },
  { number: '3,400+', label: 'Businesses listed' },
  { number: '10', label: 'Industries' },
  { number: '23%', label: 'Avg hidden fee gap' },
  { number: '8', label: 'States & territories' },
]

const STEPS = [
  {
    step: '1',
    title: 'Search any service',
    desc: 'Find by suburb, postcode, business name, or industry. We cover property managers, mechanics, lawyers, builders, doctors, and more.',
  },
  {
    step: '2',
    title: 'Share what you paid',
    desc: 'Anonymously submit your fees — both the good and the bad. Upload evidence for verification. It takes under 3 minutes.',
  },
  {
    step: '3',
    title: 'Compare & negotiate',
    desc: 'See how your provider stacks up. Use real community data to push back on unfair charges or find better alternatives.',
  },
]

const FEATURES = [
  { icon: '🔒', title: 'Anonymous by design', desc: 'Your identity is never revealed. We use pseudonymous IDs and purge IP data after 30 days.' },
  { icon: '📊', title: 'Quote vs Reality', desc: 'Compare what you were quoted against what you actually paid. Expose the gap across any industry.' },
  { icon: '🛡️', title: 'Verified & moderated', desc: 'Every submission goes through risk checks and community moderation. Evidence-backed, no fake reviews.' },
  { icon: '🗺️', title: 'Search by location', desc: 'Find fees by suburb or postcode. Know the going rate in your area before you commit.' },
  { icon: '⚖️', title: 'Fair dispute process', desc: 'Businesses can respond to submissions. Our team reviews disputes within 48 hours.' },
  { icon: '🇦🇺', title: 'Made for Australia', desc: 'Covers all states and territories. GST-aware. Built around Australian norms and regulations.' },
]

// ===== TYPES =====

interface ReportData {
  industry: string
  industryLabel: string
  time: string
  title: string
  body: string
  tag: 'positive' | 'negative' | 'neutral'
  tagLabel: string
  location: string
  votes: number
}

// ===== COMPONENTS =====

function RotatingFee() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % ROTATING_FEES.length)
        setVisible(true)
      }, 400)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fl-rotating-fee">
      Surprise fee of the day:{' '}
      <span
        style={{
          display: 'inline-block',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          color: 'var(--accent)',
          fontStyle: 'italic',
        }}
      >
        &ldquo;{ROTATING_FEES[index]}&rdquo;
      </span>
    </div>
  )
}

function TabbedSearch() {
  const [activeTab, setActiveTab] = useState('property')
  const [query, setQuery] = useState('')

  const currentTab = SEARCH_TABS.find((t) => t.id === activeTab)

  return (
    <div className="fl-search-block">
      <div className="fl-search-tabs">
        {SEARCH_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`fl-search-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="fl-search-tab-icon">{tab.icon}</span>
            <span className="fl-search-tab-label">{tab.label}</span>
            <span className="fl-search-tab-dot" />
          </button>
        ))}
      </div>
      <div className="fl-search-box">
        <span className="fl-search-icon">🔍</span>
        <input
          type="text"
          placeholder={currentTab?.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="fl-search-btn" type="button">
          Search
        </button>
      </div>
      <div className="fl-search-hint">
        <span>Popular:</span>
        <strong>Sydney CBD</strong> · <strong>Melbourne 3000</strong> ·{' '}
        <strong>Ray White</strong> · <strong>LJ Hooker</strong>
      </div>
    </div>
  )
}

function AnimatedBlock({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const [visible, setVisible] = useState(false)

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setTimeout(() => setVisible(true), delay)
            observer.unobserve(node)
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
      )
      observer.observe(node)
    },
    [delay]
  )

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `all 0.7s ${delay}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      {children}
    </div>
  )
}

function ReportCard({ report }: { report: ReportData }) {
  return (
    <div className="fl-report-card">
      <div className="fl-report-header">
        <span className={`fl-report-industry ${report.industry}`}>
          {report.industryLabel}
        </span>
        <span className="fl-report-time">{report.time}</span>
      </div>
      <div className="fl-report-body">
        <h4>{report.title}</h4>
        <p>{report.body}</p>
      </div>
      <div className="fl-report-meta">
        <span className={`fl-report-tag ${report.tag}`}>{report.tagLabel}</span>
        <span className="fl-report-location">{report.location}</span>
        <span className="fl-report-votes">👍 {report.votes}</span>
      </div>
    </div>
  )
}

// ===== PAGE =====

export default function HomePage() {
  const [heroLoaded, setHeroLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <div className="fl-grain" />

      {/* ===== NAV ===== */}
      <nav className="fl-nav">
        <a href="/" className="fl-nav-logo">
          Fee<span>Lens</span>
        </a>
        <div className="fl-nav-links">
          <a href="/explore">Explore</a>
          <a href="/industries">Industries</a>
          <a href="/about">About</a>
          <a href="/login" className="fl-btn-primary">
            Sign in
          </a>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="fl-hero">
        <div className="fl-hero-bg" />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            opacity: heroLoaded ? 1 : 0,
            transform: heroLoaded ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div className="fl-hero-badge">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
              }}
            />
            Covering 10 industries across Australia
          </div>

          <h1>
            Know what you&rsquo;re
            <br />
            <span style={{ color: 'var(--accent)' }}>actually paying.</span>
          </h1>

          <p className="fl-hero-sub">
            Australians share real fees — the good, the bad, and the hidden — so
            you can compare, negotiate, and get a fair deal in any industry.
          </p>

          <RotatingFee />
          <TabbedSearch />
        </div>
      </section>

      {/* ===== INDUSTRY GRID ===== */}
      <section className="fl-section">
        <div className="fl-section-label">Browse by industry</div>
        <h2 className="fl-section-title">
          Transparency across every service you pay for
        </h2>

        <div className="fl-industry-grid">
          {INDUSTRIES_MAIN.map((ind, i) => (
            <AnimatedBlock key={ind.icon} delay={i * 80}>
              <div className="fl-industry-card">
                <div className="fl-industry-icon">{ind.icon}</div>
                <div
                  className="fl-industry-name"
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {ind.name}
                </div>
                <div className="fl-industry-count">{ind.count}</div>
              </div>
            </AnimatedBlock>
          ))}
        </div>

        <div className="fl-industry-grid-sm">
          {INDUSTRIES_SECONDARY.map((ind, i) => (
            <AnimatedBlock key={ind.icon} delay={200 + i * 60}>
              <div className="fl-industry-card-sm">
                <span className="fl-industry-icon-sm">{ind.icon}</span>
                <span className="fl-industry-name-sm">{ind.name}</span>
              </div>
            </AnimatedBlock>
          ))}
        </div>
      </section>

      {/* ===== RECENT REPORTS ===== */}
      <section className="fl-section">
        <div className="fl-section-label">Live from the community</div>
        <h2 className="fl-section-title">Recent fee reports</h2>
        <p className="fl-section-desc">
          Real submissions from real Australians. Names and identifying details
          are always hidden.
        </p>

        <div className="fl-reports-grid">
          {SAMPLE_REPORTS.map((report, i) => (
            <AnimatedBlock key={report.title} delay={i * 80}>
              <ReportCard report={report} />
            </AnimatedBlock>
          ))}
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="fl-section">
        <div className="fl-stats-inner">
          {STATS.map((s, i) => (
            <AnimatedBlock key={s.label} delay={i * 100}>
              <div className="fl-stat">
                <div className="fl-stat-num">{s.number}</div>
                <div className="fl-stat-label">{s.label}</div>
              </div>
            </AnimatedBlock>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="fl-section">
        <div className="fl-section-label">How it works</div>
        <h2 className="fl-section-title">Three steps to transparency</h2>
        <p className="fl-section-desc">
          No sign-up fees, no data selling. Just real numbers from real people.
        </p>
        <div className="fl-steps-row">
          {STEPS.map((step, i) => (
            <AnimatedBlock key={step.step} delay={i * 120}>
              <div className="fl-step">
                <div className="fl-step-num">{step.step}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </AnimatedBlock>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="fl-section">
        <div className="fl-divider-accent" />
        <div className="fl-section-label">Why FeeLens</div>
        <h2 className="fl-section-title">
          Built for Australians who want a fair go
        </h2>
        <p className="fl-section-desc">
          Fee transparency is a right, not a privilege.
        </p>
        <div className="fl-feature-grid">
          {FEATURES.map((f, i) => (
            <AnimatedBlock key={f.title} delay={i * 80}>
              <div className="fl-feature-card">
                <div className="fl-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </AnimatedBlock>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="fl-cta-section">
        <h2>
          Had a surprise fee?
          <br />
          <span style={{ color: 'var(--accent)' }}>Share it.</span>
        </h2>
        <p>
          Every submission helps thousands of Australians make better decisions.
          It takes 2 minutes and it&rsquo;s completely anonymous.
        </p>
        <div className="fl-cta-btns">
          <a href="/submit" className="fl-btn-primary">
            Submit a fee report →
          </a>
          <a href="/explore" className="fl-btn-outline">
            Browse industries
          </a>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="fl-footer">
        <div className="fl-footer-copy">
          © 2026 FeeLens · ABN pending · Made in Sydney
        </div>
        <div className="fl-footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </div>
      </footer>
    </>
  )
}
