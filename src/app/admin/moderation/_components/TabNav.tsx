// src/app/admin/moderation/_components/TabNav.tsx
'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface TabNavProps {
  active: 'reports' | 'entries' | 'providers'
  counts: { reports: number; entries: number; providers: number }
}

const tabs = [
  { key: 'reports', label: 'Reports' },
  { key: 'entries', label: 'Entries' },
  { key: 'providers', label: 'Providers' },
] as const

export default function TabNav({ active, counts }: TabNavProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-1">
        {tabs.map((tab) => {
          const count = counts[tab.key]
          const isActive = active === tab.key

          return (
            <Link
              key={tab.key}
              href={`/admin/moderation?tab=${tab.key}`}
              className={[
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition',
                isActive
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
