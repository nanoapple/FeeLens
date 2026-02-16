'use client'

import { useState, useEffect } from 'react'

// ==========================================
// FeeLens Landing Page
// Aesthetic: Sharp minimal with warm Australian tones
// Target: Young renters/owners who are fed up with opaque fees
// ==========================================

const HIDDEN_FEE_EXAMPLES = [
  'Annual statement fee — $85',
  'Card payment surcharge — 1.5%',
  'Routine inspection fee — $110',
  'Maintenance coordination markup — 15%',
  'End of year audit fee — $120',
  'Advertising fee for re-letting — $350',
  'After-hours call-out fee — $95',
  'Insurance admin charge — $65',
]

function RotatingFee() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % HIDDEN_FEE_EXAMPLES.length)
        setVisible(true)
      }, 400)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <span
      style={{
        display: 'inline-block',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        color: '#E8590C',
        fontStyle: 'italic',
      }}
    >
      &ldquo;{HIDDEN_FEE_EXAMPLES[index]}&rdquo;
    </span>
  )
}

function StatCard({ number, label, delay }: { number: string; label: string; delay: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(24px)',
        transition: 'all 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1a1a1a' }}>
        {number}
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

function HowItWorksStep({ step, title, desc, delay }: { step: string; title: string; desc: string; delay: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        flex: 1,
        minWidth: 220,
      }}
    >
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#1a1a1a',
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: 700,
        marginBottom: '1rem',
      }}>
        {step}
      </div>
      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1a1a1a' }}>{title}</h3>
      <p style={{ fontSize: '0.95rem', color: '#666', lineHeight: 1.6 }}>{desc}</p>
    </div>
  )
}

export default function HomePage() {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap');

        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        
        html { scroll-behavior: smooth; }
        
        body {
          font-family: 'Outfit', -apple-system, sans-serif;
          background: #FAFAF8;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }

        ::selection {
          background: #E8590C;
          color: white;
        }

        .fl-hero-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 0;
        }

        .fl-hero-bg::before {
          content: '';
          position: absolute;
          top: -40%;
          right: -20%;
          width: 80vw;
          height: 80vw;
          max-width: 900px;
          max-height: 900px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232, 89, 12, 0.06) 0%, transparent 70%);
        }

        .fl-hero-bg::after {
          content: '';
          position: absolute;
          bottom: -20%;
          left: -10%;
          width: 50vw;
          height: 50vw;
          max-width: 600px;
          max-height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(26, 26, 26, 0.03) 0%, transparent 70%);
        }

        .fl-grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 256px;
        }

        .fl-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1.25rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(250, 250, 248, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(0,0,0,0.04);
        }

        .fl-nav-logo {
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #1a1a1a;
          text-decoration: none;
        }

        .fl-nav-logo span {
          color: #E8590C;
        }

        .fl-nav-links {
          display: flex;
          gap: 2rem;
          align-items: center;
        }

        .fl-nav-links a {
          font-size: 0.88rem;
          font-weight: 500;
          color: #666;
          text-decoration: none;
          transition: color 0.2s;
          letter-spacing: 0.01em;
        }

        .fl-nav-links a:hover { color: #1a1a1a; }

        .fl-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.6rem;
          background: #1a1a1a;
          color: #fff;
          border: none;
          border-radius: 100px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
          text-decoration: none;
          letter-spacing: 0.01em;
        }

        .fl-btn-primary:hover {
          background: #E8590C;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(232, 89, 12, 0.2);
        }

        .fl-btn-outline {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.6rem;
          background: transparent;
          color: #1a1a1a;
          border: 1.5px solid #ddd;
          border-radius: 100px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          text-decoration: none;
        }

        .fl-btn-outline:hover {
          border-color: #1a1a1a;
          background: rgba(0,0,0,0.02);
        }

        .fl-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 8rem 2rem 4rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .fl-hero-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 1rem;
          background: rgba(232, 89, 12, 0.08);
          border-radius: 100px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #E8590C;
          margin-bottom: 2rem;
          width: fit-content;
          letter-spacing: 0.02em;
        }

        .fl-hero h1 {
          font-size: clamp(2.8rem, 6vw, 5rem);
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -0.04em;
          color: #1a1a1a;
          max-width: 800px;
          margin-bottom: 1.5rem;
        }

        .fl-hero-sub {
          font-family: 'Newsreader', Georgia, serif;
          font-size: clamp(1.1rem, 2vw, 1.35rem);
          line-height: 1.65;
          color: #666;
          max-width: 560px;
          margin-bottom: 1rem;
        }

        .fl-hero-rotating {
          min-height: 2rem;
          margin-bottom: 2.5rem;
          font-family: 'Newsreader', Georgia, serif;
          font-size: 1.05rem;
        }

        .fl-search-bar {
          display: flex;
          max-width: 520px;
          border-radius: 100px;
          overflow: hidden;
          border: 1.5px solid #e0e0e0;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .fl-search-bar:focus-within {
          border-color: #E8590C;
          box-shadow: 0 0 0 3px rgba(232, 89, 12, 0.08);
        }

        .fl-search-bar input {
          flex: 1;
          border: none;
          outline: none;
          padding: 0.9rem 1.5rem;
          font-family: 'Outfit', sans-serif;
          font-size: 0.95rem;
          color: #1a1a1a;
          background: transparent;
        }

        .fl-search-bar input::placeholder { color: #bbb; }

        .fl-search-bar button {
          padding: 0.9rem 1.8rem;
          background: #1a1a1a;
          color: #fff;
          border: none;
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }

        .fl-search-bar button:hover { background: #E8590C; }

        .fl-section {
          padding: 6rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .fl-section-label {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #E8590C;
          margin-bottom: 1rem;
        }

        .fl-section-title {
          font-size: clamp(1.8rem, 3.5vw, 2.6rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.15;
          color: #1a1a1a;
          margin-bottom: 1rem;
          max-width: 600px;
        }

        .fl-section-desc {
          font-family: 'Newsreader', Georgia, serif;
          font-size: 1.1rem;
          line-height: 1.65;
          color: #888;
          max-width: 520px;
          margin-bottom: 3rem;
        }

        .fl-stats-row {
          display: flex;
          gap: 4rem;
          flex-wrap: wrap;
          padding: 3rem 0;
          border-top: 1px solid #eee;
          border-bottom: 1px solid #eee;
          justify-content: center;
        }

        .fl-steps-row {
          display: flex;
          gap: 3rem;
          flex-wrap: wrap;
        }

        .fl-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .fl-feature-card {
          padding: 2rem;
          background: #fff;
          border: 1px solid #eee;
          border-radius: 16px;
          transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .fl-feature-card:hover {
          border-color: #E8590C;
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.06);
        }

        .fl-feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #FAFAF8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          margin-bottom: 1.25rem;
        }

        .fl-feature-card h3 {
          font-size: 1.05rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: #1a1a1a;
        }

        .fl-feature-card p {
          font-size: 0.9rem;
          color: #888;
          line-height: 1.6;
        }

        .fl-cta-section {
          text-align: center;
          padding: 6rem 2rem;
          max-width: 700px;
          margin: 0 auto;
        }

        .fl-cta-section h2 {
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.1;
          margin-bottom: 1rem;
        }

        .fl-cta-section p {
          font-family: 'Newsreader', Georgia, serif;
          font-size: 1.15rem;
          color: #888;
          line-height: 1.6;
          margin-bottom: 2.5rem;
        }

        .fl-cta-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .fl-footer {
          padding: 3rem 2rem;
          border-top: 1px solid #eee;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .fl-footer-copy {
          font-size: 0.82rem;
          color: #aaa;
        }

        .fl-footer-links {
          display: flex;
          gap: 1.5rem;
        }

        .fl-footer-links a {
          font-size: 0.82rem;
          color: #aaa;
          text-decoration: none;
          transition: color 0.2s;
        }

        .fl-footer-links a:hover { color: #1a1a1a; }

        .fl-divider-accent {
          width: 48px;
          height: 3px;
          background: #E8590C;
          border-radius: 2px;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .fl-nav { padding: 1rem 1.25rem; }
          .fl-nav-links { gap: 1rem; }
          .fl-nav-links a:not(:last-child) { display: none; }
          .fl-hero { padding: 7rem 1.25rem 3rem; }
          .fl-section { padding: 4rem 1.25rem; }
          .fl-stats-row { gap: 2.5rem; }
          .fl-steps-row { flex-direction: column; gap: 2rem; }
          .fl-search-bar { flex-direction: column; border-radius: 16px; }
          .fl-search-bar input { padding: 1rem 1.25rem; }
          .fl-search-bar button { padding: 1rem; border-radius: 0; }
        }
      `}</style>

      <div className="fl-grain" />

      {/* Nav */}
      <nav className="fl-nav">
        <a href="/" className="fl-nav-logo">Fee<span>Lens</span></a>
        <div className="fl-nav-links">
          <a href="/explore">Explore</a>
          <a href="/providers">Agencies</a>
          <a href="/login" className="fl-btn-primary">Sign in</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="fl-hero">
        <div className="fl-hero-bg" />
        <div style={{
          position: 'relative',
          zIndex: 1,
          opacity: heroLoaded ? 1 : 0,
          transform: heroLoaded ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          <div className="fl-hero-tag">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8590C', display: 'inline-block' }} />
            Now live across Australia
          </div>

          <h1>
            Know what you&rsquo;re<br />
            actually paying.
          </h1>

          <p className="fl-hero-sub">
            Australians share real property management fees so you can compare, 
            negotiate, and stop getting blindsided by hidden charges.
          </p>

          <div className="fl-hero-rotating">
            Surprise fee of the day: <RotatingFee />
          </div>

          <div className="fl-search-bar">
            <input
              type="text"
              placeholder="Search by suburb, postcode, or agency name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="button">Search</button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="fl-section">
        <div className="fl-stats-row">
          <StatCard number="2,400+" label="Fee reports" delay={200} />
          <StatCard number="850+" label="Agencies listed" delay={400} />
          <StatCard number="23%" label="Avg hidden fee gap" delay={600} />
          <StatCard number="8" label="States & territories" delay={800} />
        </div>
      </section>

      {/* How it works */}
      <section className="fl-section">
        <div className="fl-section-label">How it works</div>
        <h2 className="fl-section-title">Three steps to transparency</h2>
        <p className="fl-section-desc">
          No sign-up fees, no data selling. Just real numbers from real people.
        </p>
        <div className="fl-steps-row">
          <HowItWorksStep
            step="1"
            title="Find your agency"
            desc="Search by suburb, postcode, or agency name. We cover every state and territory."
            delay={200}
          />
          <HowItWorksStep
            step="2"
            title="Share what you paid"
            desc="Anonymously submit your management fees, hidden charges, and quote-vs-reality breakdown."
            delay={400}
          />
          <HowItWorksStep
            step="3"
            title="Compare & negotiate"
            desc="See how your agency stacks up. Use real data to push back on unfair fees."
            delay={600}
          />
        </div>
      </section>

      {/* Features */}
      <section className="fl-section">
        <div className="fl-divider-accent" />
        <div className="fl-section-label">Why FeeLens</div>
        <h2 className="fl-section-title">Built for renters & owners who want a fair go</h2>
        <p className="fl-section-desc">
          We believe fee transparency is a right, not a privilege.
        </p>
        <div className="fl-card-grid">
          <div className="fl-feature-card">
            <div className="fl-feature-icon">🔒</div>
            <h3>Anonymous by design</h3>
            <p>Your identity is never revealed. We use pseudonymous IDs and purge IP data after 30 days.</p>
          </div>
          <div className="fl-feature-card">
            <div className="fl-feature-icon">📊</div>
            <h3>Quote vs Reality</h3>
            <p>Compare what you were quoted against what you actually paid. Expose the gap.</p>
          </div>
          <div className="fl-feature-card">
            <div className="fl-feature-icon">🛡️</div>
            <h3>Verified & moderated</h3>
            <p>Every submission goes through risk checks and community moderation. No fake reviews.</p>
          </div>
          <div className="fl-feature-card">
            <div className="fl-feature-icon">🗺️</div>
            <h3>Search by location</h3>
            <p>Find fees by suburb or postcode. Know the going rate in your area before you sign.</p>
          </div>
          <div className="fl-feature-card">
            <div className="fl-feature-icon">⚖️</div>
            <h3>Fair dispute process</h3>
            <p>Agencies can respond to submissions. Our team reviews disputes within 48 hours.</p>
          </div>
          <div className="fl-feature-card">
            <div className="fl-feature-icon">🇦🇺</div>
            <h3>Made for Australia</h3>
            <p>Covers all states and territories. GST-aware. Built around Australian property management norms.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="fl-cta-section">
        <h2>
          Had a surprise fee?<br />
          <span style={{ color: '#E8590C' }}>Share it.</span>
        </h2>
        <p>
          Every submission helps thousands of Australians make better decisions.
          It takes 2 minutes and it&rsquo;s completely anonymous.
        </p>
        <div className="fl-cta-buttons">
          <a href="/submit" className="fl-btn-primary">
            Submit a fee report →
          </a>
          <a href="/explore" className="fl-btn-outline">
            Browse agencies
          </a>
        </div>
      </section>

      {/* Footer */}
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