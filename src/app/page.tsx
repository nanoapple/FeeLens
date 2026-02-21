// src/app/page.tsx
// ==========================================
// FeeLens Homepage
//
// Renders HomeClient with static popular links.
// Stats + recent reports are fetched client-side
// from /api/home (see home-client.tsx for future expansion).
// ==========================================

import { HomeClient } from '@/components/home/home-client'
import type { PopularLink } from '@/types/home'

const POPULAR_LINKS: PopularLink[] = [
  { label: 'Sydney CBD', href: '/entries?industry=real_estate&q=2000' },
  { label: 'Melbourne 3000', href: '/entries?industry=real_estate&q=3000' },
  { label: 'Ray White', href: '/entries?industry=real_estate&q=ray+white' },
  { label: 'LJ Hooker', href: '/entries?industry=real_estate&q=lj+hooker' },
]

export default function HomePage() {
  return <HomeClient popular={POPULAR_LINKS} />
}
