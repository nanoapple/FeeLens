// src/app/(main)/explore/page.tsx
import dynamic from 'next/dynamic'

const ExploreClient = dynamic(
  () => import('@/components/explore/ExploreClient.tsx').then((m) => ({
    default: m.ExploreClient,
  })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F5F0',
          fontFamily: 'DM Sans, sans-serif',
          color: '#999',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}
      >
        Loading map
      </div>
    ),
  }
)

export default function ExplorePage() {
  return <ExploreClient />
}
