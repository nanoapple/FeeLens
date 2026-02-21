// src/components/explore/ExploreShell.tsx

import type { ExploreQuery, ExploreResponseDTO, ExploreSort } from '@/types/explore'

type Props = {
  query: ExploreQuery
  data: ExploreResponseDTO
  activeMode?: 'fee_reports' | 'providers'
}

export default function ExploreShell({ query, data, activeMode = 'fee_reports' }: Props) {
  const { items, meta, summary } = data

  const industry = query.industryKey
  const q = query.search?.q ?? ''
  const state = query.location?.state ?? ''
  const postcode = query.location?.postcode ?? ''
  const suburb = query.location?.suburb ?? ''
  const tiers = query.evidenceTiers?.join(',') ?? ''
  const sort = query.sort
  const pageSize = query.pagination.pageSize

  return (
    <main className="w-full">
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ModeTab href="/explore" active={activeMode === 'fee_reports'}>
                Fee Reports
              </ModeTab>
              <ModeTab href="/providers" active={activeMode === 'providers'}>
                Providers
              </ModeTab>
            </div>

            <div className="flex w-full max-w-xl items-center justify-end gap-2">
              <form action="/explore" method="GET" className="flex w-full items-center gap-2">
                <input type="hidden" name="industry" value={industry} />
                <input type="hidden" name="state" value={state} />
                <input type="hidden" name="postcode" value={postcode} />
                <input type="hidden" name="suburb" value={suburb} />
                <input type="hidden" name="tiers" value={tiers} />
                <input type="hidden" name="pageSize" value={String(pageSize)} />

                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search suburb, postcode, or provider name…"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                  aria-label="Search"
                />

                <select
                  name="sort"
                  defaultValue={sort}
                  className="rounded-md border px-2 py-2 text-sm"
                  aria-label="Sort"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest_paid">Highest paid</option>
                  <option value="lowest_paid">Lowest paid</option>
                  <option value="highest_delta">Highest delta</option>
                  <option value="lowest_delta">Lowest delta</option>
                  <option value="best_evidence">Best evidence</option>
                </select>

                <button
                  type="submit"
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Search
                </button>
              </form>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <IndustryTab industryKey="real_estate" active={industry === 'real_estate'} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Filters</h2>

            <div className="mt-4 space-y-3">
              <Field label="State (e.g. NSW)">
                <input
                  name="state"
                  form="explore-filter-form"
                  defaultValue={state}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Postcode">
                <input
                  name="postcode"
                  form="explore-filter-form"
                  defaultValue={postcode}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Suburb">
                <input
                  name="suburb"
                  form="explore-filter-form"
                  defaultValue={suburb}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Evidence tiers (A,B,C)">
                <input
                  name="tiers"
                  form="explore-filter-form"
                  defaultValue={tiers}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>

              <form id="explore-filter-form" action="/explore" method="GET" className="pt-2">
                <input type="hidden" name="industry" value={industry} />
                <input type="hidden" name="q" value={q} />
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="pageSize" value={String(pageSize)} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Apply filters
                </button>
              </form>
            </div>

            <hr className="my-5" />

            <h3 className="text-sm font-semibold">Summary</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total" value={String(summary.totalCount)} />
              <Stat label="P50 (median)" value={fmtMoney(summary.paidP50)} />
              <Stat label="P25" value={fmtMoney(summary.paidP25)} />
              <Stat label="P75" value={fmtMoney(summary.paidP75)} />
            </div>
          </aside>

          <section className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Fee Reports</div>
                <div className="text-xs text-gray-600">
                  Page {meta.page} of {meta.totalPages} · {meta.totalCount} total
                </div>
              </div>

              <div className="text-xs text-gray-600">
                Sort: <span className="font-medium">{labelSort(sort)}</span>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-sm text-gray-700">No results match your filters.</div>
            ) : (
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.entry.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900">
                            {it.provider.name}
                          </div>
                          <TierBadge tier={it.entry.evidenceTier} />
                          {it.entry.disputeStatus && it.entry.disputeStatus !== 'none' ? (
                            <StatusBadge label={`Dispute: ${it.entry.disputeStatus}`} />
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-gray-600">
                          {fmtLocation(it.provider.suburb, it.provider.state, it.provider.postcode)}
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          Submitted: {it.entry.submitDate}
                          {it.entry.hiddenItemsCount ? ` · Hidden items: ${it.entry.hiddenItemsCount}` : ''}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold">{fmtMoney(it.entry.finalTotalPaid)}</div>
                        {it.entry.initialQuoteTotal != null && it.entry.deltaPct != null ? (
                          <div className="mt-1 text-xs text-gray-600">
                            Quote {fmtMoney(it.entry.initialQuoteTotal)} · Δ {it.entry.deltaPct}%
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {meta.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <a
                  className={`rounded-md border px-3 py-2 ${
                    meta.page <= 1 ? 'pointer-events-none opacity-40' : ''
                  }`}
                  href={pageHref(query, meta.page - 1)}
                >
                  Prev
                </a>
                <div className="text-xs text-gray-600">
                  {meta.page} / {meta.totalPages}
                </div>
                <a
                  className={`rounded-md border px-3 py-2 ${
                    meta.page >= meta.totalPages ? 'pointer-events-none opacity-40' : ''
                  }`}
                  href={pageHref(query, meta.page + 1)}
                >
                  Next
                </a>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function ModeTab({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold tracking-wide ${
        active ? 'bg-black text-white' : 'bg-white text-gray-900'
      }`}
    >
      {children}
    </a>
  )
}

function IndustryTab({ industryKey, active }: { industryKey: string; active: boolean }) {
  const href = `/explore?industry=${encodeURIComponent(industryKey)}`
  return (
    <a
      href={href}
      className={`border-b-2 pb-1 text-xs font-semibold ${
        active
          ? 'border-orange-500 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      {industryKey === 'real_estate' ? 'Property' : industryKey}
    </a>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-gray-700">{label}</div>
      {children}
    </label>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const cls =
    tier === 'A'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tier === 'B'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-gray-50 text-gray-700 border-gray-200'
  return <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>TIER {tier}</span>
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="rounded border bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  )
}

function fmtMoney(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtLocation(suburb?: string | null, state?: string | null, postcode?: string | null): string {
  const parts = [suburb, state, postcode].filter((x) => x && String(x).trim().length)
  return parts.join(', ')
}

function labelSort(sort: ExploreSort): string {
  switch (sort) {
    case 'newest':
      return 'Newest'
    case 'oldest':
      return 'Oldest'
    case 'highest_paid':
      return 'Highest paid'
    case 'lowest_paid':
      return 'Lowest paid'
    case 'highest_delta':
      return 'Highest delta'
    case 'lowest_delta':
      return 'Lowest delta'
    case 'best_evidence':
      return 'Best evidence'
    default:
      return sort
  }
}

function pageHref(q: ExploreQuery, page: number): string {
  const sp = new URLSearchParams()
  sp.set('industry', q.industryKey)
  if (q.serviceKey) sp.set('service', q.serviceKey)

  if (q.location?.state) sp.set('state', q.location.state)
  if (q.location?.postcode) sp.set('postcode', q.location.postcode)
  if (q.location?.suburb) sp.set('suburb', q.location.suburb)

  if (q.search?.q) sp.set('q', q.search.q)

  if (q.money?.minPaid != null) sp.set('minPaid', String(q.money.minPaid))
  if (q.money?.maxPaid != null) sp.set('maxPaid', String(q.money.maxPaid))

  if (q.evidenceTiers?.length) sp.set('tiers', q.evidenceTiers.join(','))

  sp.set('sort', q.sort)
  sp.set('page', String(Math.max(1, page)))
  sp.set('pageSize', String(q.pagination.pageSize))

  return `/explore?${sp.toString()}`
}