// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FeeLens — See Every Fee. Every Industry. Australia-wide.',
  description:
    'Australians share real fees across property management, auto repair, legal, construction, healthcare and more. Compare, negotiate, and stop getting blindsided by hidden charges.',
  keywords: [
    'fee transparency',
    'hidden fees Australia',
    'property management fees',
    'compare fees',
    'auto repair costs',
    'legal fees Australia',
    'construction quotes',
    'FeeLens',
  ],
  openGraph: {
    title: 'FeeLens — See Every Fee. Every Industry.',
    description:
      'Real fee reports from real Australians. Compare what others paid and get a fair deal.',
    siteName: 'FeeLens',
    locale: 'en_AU',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
