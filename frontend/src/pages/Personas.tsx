import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPersonaDimensions, getAvailablePersonas, installPersona, type PersonaDimension, type PersonaAvailableItem } from '../api/personas'
import { mockSpecialists } from '../data/mock'

type Tab = 'yours' | 'marketplace'

type PersonaMeta = {
  id: string
  name: string
  color: string
  initials: string
}

function getColorForSlug(slug: string): string {
  const s = mockSpecialists.find((x) => x.id === slug)
  return s?.color ?? '#6366f1'
}

function buildPersonaMetaFromAvailable(list: PersonaAvailableItem[], fallbackNames?: string[]): Record<string, PersonaMeta> {
  const out: Record<string, PersonaMeta> = {}
  for (const p of list) {
    const name = p.name
    out[name] = {
      id: p.slug,
      name,
      color: getColorForSlug(p.slug),
      initials: name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    }
  }
  if (fallbackNames) {
    for (const name of fallbackNames) {
      if (out[name]) continue
      const slug = name === 'Business Dev' ? 'bd' : name.toLowerCase().replace(/\s+/g, '-')
      out[name] = {
        id: slug,
        name,
        color: getColorForSlug(slug === 'business-development' ? 'bd' : slug),
        initials: name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      }
    }
  }
  if (out['Business Development'] && !out['Business Dev']) {
    out['Business Dev'] = { ...out['Business Development'], name: 'Business Dev' }
  }
  return out
}

/** Fallback marketplace entry so Hydroelectric (Technical subpersona) always appears when API has no data */
const FALLBACK_MARKETPLACE: PersonaAvailableItem[] = [
  {
    id: 'hydroelectric',
    name: 'Hydroelectric Power Specialist',
    slug: 'hydroelectric',
    type: 'subpersona',
    parent_slug: 'technical',
    description:
      'A technical specialist focused on evaluating hydroelectric power projects, including hydrology, turbine systems, civil infrastructure, grid connection, construction risks, and operational reliability.',
    domain: 'energy',
    subdomain: 'hydroelectric',
    primary_sources: [
      'International Energy Agency',
      'U.S. Department of Energy',
      'World Bank',
      'International Hydropower Association',
      'European Environment Agency',
    ],
  },
]

/** Fallback dimensions for Hydroelectric when /api/personas/dimensions returns no data (so Marketplace card always shows weights) */
const HYDROELECTRIC_DIMENSIONS_FALLBACK: PersonaDimension[] = [
  { id: 'hydro-scal', persona_name: 'Hydroelectric', dimension_name: 'Scalability', base_weight: 0.15, notes: 'Score based on ability to add capacity (MW) without major redesign; head/flow constraints, run-of-river vs reservoir, seasonal variability, multi-site or cascade replication, grid integration at scale.', sort_order: 0 },
  { id: 'hydro-exec', persona_name: 'Hydroelectric', dimension_name: 'Execution Complexity', base_weight: 0.25, notes: 'Civil works, geology, environmental/permitting (FERC, water rights, fish passage), grid interconnection, turbine/equipment lead times, hydrology and feasibility studies, EPC and O&M contracting.', sort_order: 1 },
  { id: 'hydro-debt', persona_name: 'Hydroelectric', dimension_name: 'Technical Debt', base_weight: 0.15, notes: 'Legacy turbine controls and SCADA, outdated instrumentation, deferred refurbishment, condition monitoring gaps.', sort_order: 2 },
  { id: 'hydro-rel', persona_name: 'Hydroelectric', dimension_name: 'Reliability / Security', base_weight: 0.30, notes: 'Dam safety and surveillance, spillway and flood risk, cybersecurity for SCADA/ICS/OT, environmental incident risk, regulatory compliance (e.g. FERC).', sort_order: 3 },
  { id: 'hydro-team', persona_name: 'Hydroelectric', dimension_name: 'Team Fit', base_weight: 0.15, notes: 'In-house hydro experience (civil, mechanical, electrical, hydrology), EPC and O&M partner capability, specialist contractors, knowledge transfer and succession.', sort_order: 4 },
]

export function Personas() {
  const [tab, setTab] = useState<Tab>('yours')
  const [dimensions, setDimensions] = useState<PersonaDimension[]>([])
  const [available, setAvailable] = useState<PersonaAvailableItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePersona, setActivePersona] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string>(() => (typeof localStorage !== 'undefined' ? localStorage.getItem('personas_company_id') ?? '' : ''))

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dims, avail] = await Promise.all([getPersonaDimensions(), getAvailablePersonas(companyId || undefined)])
      setDimensions(dims)
      setAvailable(avail)
      if (avail.length > 0 && !activePersona) {
        const first = tab === 'yours' ? avail.find((p) => p.type === 'base_persona') : avail[0]
        if (first) setActivePersona(first.name)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setAvailable([])
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const byPersona = useMemo(() => {
    const map = new Map<string, PersonaDimension[]>()
    for (const d of dimensions) {
      if (!map.has(d.persona_name)) map.set(d.persona_name, [])
      map.get(d.persona_name)!.push(d)
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.sort_order - b.sort_order)
    }
    return map
  }, [dimensions])

  const nameToSlug: Record<string, string> = useMemo(
    () => ({
      Legal: 'legal',
      Financial: 'financial',
      Technical: 'technical',
      'Business Development': 'bd',
      'Business Dev': 'bd',
      Tax: 'tax',
      Hydroelectric: 'hydroelectric',
    }),
    []
  )
  /** Map display name (from personas table) to persona_name used in persona_dimensions API */
  const nameToDimensionKey: Record<string, string> = useMemo(
    () => ({
      'Hydroelectric Power Specialist': 'Hydroelectric',
      'Business Development': 'Business Dev',
    }),
    []
  )
  const dimensionKeyFor = useCallback(
    (name: string) => nameToDimensionKey[name] ?? name,
    [nameToDimensionKey]
  )
  /** Get dimensions for a persona card; tries API data, then slug/case-insensitive match, then static fallback for Hydroelectric. */
  const getDimensionsForCard = useCallback(
    (p: PersonaAvailableItem): PersonaDimension[] => {
      const key = dimensionKeyFor(p.name)
      const fromKey = byPersona.get(key)
      if (fromKey?.length) return fromKey
      if (p.slug === 'hydroelectric') {
        const match = Array.from(byPersona.keys()).find((k) => k.toLowerCase() === 'hydroelectric')
        const fromApi = match ? byPersona.get(match) ?? [] : []
        if (fromApi.length > 0) return fromApi
        return HYDROELECTRIC_DIMENSIONS_FALLBACK
      }
      return byPersona.get(p.name) ?? []
    },
    [byPersona, dimensionKeyFor]
  )
  const yoursList = useMemo(() => {
    const fromApi = companyId
      ? available
      : available.filter((p) => p.type === 'base_persona')
    if (fromApi.length > 0) return fromApi
    const fromDims = Array.from(new Set(dimensions.map((d) => d.persona_name)))
    return fromDims.map((name) => ({
      id: nameToSlug[name] ?? name.toLowerCase().replace(/\s+/g, '-'),
      name,
      slug: nameToSlug[name] ?? name.toLowerCase().replace(/\s+/g, '-'),
      type: 'base_persona' as const,
      parent_slug: null,
      description: null,
      domain: null,
      subdomain: null,
      primary_sources: undefined,
    }))
  }, [available, companyId, dimensions, nameToSlug])

  const corePersonas = useMemo(() => yoursList.filter((p) => p.type === 'base_persona'), [yoursList])
  const subPersonas = useMemo(() => yoursList.filter((p) => p.type === 'subpersona'), [yoursList])

  const yoursSlugs = useMemo(() => new Set(yoursList.map((p) => p.slug)), [yoursList])
  const marketplaceList = useMemo(() => {
    const fromApi = available.filter((p) => p.type === 'subpersona' && !yoursSlugs.has(p.slug))
    const apiSlugs = new Set(fromApi.map((p) => p.slug))
    const fallback = FALLBACK_MARKETPLACE.filter((p) => !apiSlugs.has(p.slug) && !yoursSlugs.has(p.slug))
    const list = fromApi.length > 0 ? fromApi : fallback
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.domain ?? '').toLowerCase().includes(q) ||
        (p.subdomain ?? '').toLowerCase().includes(q)
    )
  }, [available, search, yoursSlugs])

  const displayList = tab === 'yours' ? [...corePersonas, ...subPersonas] : marketplaceList
  const personaMeta = useMemo(() => {
    const forMeta = available.length > 0 ? available : [...yoursList.map((n) => ({ ...n, name: n.name }))]
    const withFallback = [...forMeta]
    const hasSlug = new Set(forMeta.map((p) => p.slug))
    for (const p of FALLBACK_MARKETPLACE) {
      if (!hasSlug.has(p.slug)) withFallback.push(p)
    }
    return buildPersonaMetaFromAvailable(withFallback, available.length === 0 ? yoursList.map((p) => p.name) : undefined)
  }, [available, yoursList])
  const activeItem = activePersona ? displayList.find((p) => p.name === activePersona) ?? displayList[0] : displayList[0]
  const activeDimensions = activeItem ? getDimensionsForCard(activeItem) : []
  const activeMeta = activePersona ? personaMeta[activePersona] : undefined

  const handleInstall = useCallback(
    async (slug: string) => {
      const cid = companyId.trim()
      if (!cid) {
        const id = crypto.randomUUID()
        setCompanyId(id)
        localStorage?.setItem('personas_company_id', id)
        setInstallingSlug(slug)
        try {
          await installPersona(id, slug)
          await loadData()
        } finally {
          setInstallingSlug(null)
        }
        return
      }
      setInstallingSlug(slug)
      try {
        await installPersona(cid, slug)
        await loadData()
      } finally {
        setInstallingSlug(null)
      }
    },
    [companyId, loadData]
  )

  function renderPersonaCard(p: PersonaAvailableItem, isYours: boolean) {
    const meta = personaMeta[p.name]
    const dims = getDimensionsForCard(p)
    const selected = activePersona === p.name
    const showDimensions = dims.length > 0
    return (
      <button
        key={p.slug}
        type="button"
        onClick={() => setActivePersona(p.name)}
        className={`group flex flex-col items-start gap-3 p-4 rounded-2xl border text-left transition-all duration-200 ${
          selected ? 'border-accent-cyan/70 bg-surface-800/90' : 'border-white/10 bg-surface-800/70 hover:border-white/25'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-semibold text-white shadow-lg"
            style={{
              background: meta
                ? `linear-gradient(135deg, ${meta.color}, rgba(15,23,42,0.9))`
                : 'linear-gradient(135deg, #6366f1, #0f172a)',
            }}
          >
            {meta?.initials ?? p.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white flex items-center gap-2 min-h-[1.25rem]">
              <span className="truncate" title={p.name}>{p.name}</span>
              {p.type === 'subpersona' && (
                <span className="shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] bg-white/10 text-white/70">
                  {p.parent_slug ?? 'technical'}
                </span>
              )}
              {selected && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-accent-cyan/15 text-accent-cyan">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                  Active
                </span>
              )}
            </p>
            <p className="text-[11px] text-white/50">
              {showDimensions
                ? `${dims.length} dimension${dims.length !== 1 ? 's' : ''} · weighted scoring`
                : [p.domain, p.subdomain].filter(Boolean).join(' · ') || 'Marketplace'}
            </p>
          </div>
        </div>
        <div className="mt-2 w-full h-1.5 rounded-full bg-surface-700 overflow-hidden">
          <div
            className="h-full rounded-full group-hover:scale-x-105 origin-left transition-transform"
            style={{ backgroundColor: meta?.color ?? '#22c55e', width: '100%' }}
          />
        </div>
        <div className="mt-2 w-full min-h-[5.5rem] flex flex-col">
          {showDimensions ? (
            <ul className="space-y-1 text-xs text-white/60 w-full">
              {dims.slice(0, 3).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{d.dimension_name}</span>
                  <span className="shrink-0 text-white/50">{(d.base_weight * 100).toFixed(0)}%</span>
                </li>
              ))}
              {dims.length > 3 && (
                <li className="text-[11px] text-white/40">+{dims.length - 3} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-white/60 line-clamp-3 w-full">
              {isYours ? ([p.domain, p.subdomain].filter(Boolean).join(' · ') || '—') : (p.description || [p.domain, p.subdomain].filter(Boolean).join(' · ') || '—')}
            </p>
          )}
        </div>
        {p.primary_sources && p.primary_sources.length > 0 && (
          <p className="mt-1.5 text-[10px] text-white/40 w-full truncate" title={p.primary_sources.join(', ')}>
            Sources: {p.primary_sources.length <= 2 ? p.primary_sources.join(', ') : `${p.primary_sources.slice(0, 2).join(', ')} & more`}
          </p>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Persona library</h1>
          <p className="text-sm text-white/60">
            Your workspace personas and the marketplace to discover and add more.
          </p>
        </div>
        <div className="flex rounded-xl border border-white/10 bg-surface-800/60 p-1">
          <button
            type="button"
            onClick={() => setTab('yours')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'yours' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Your personas
          </button>
          <button
            type="button"
            onClick={() => setTab('marketplace')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'marketplace' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Marketplace
          </button>
        </div>
      </div>

      {tab === 'marketplace' && (
        <div className="relative">
          <input
            type="search"
            placeholder="Search personas by name, domain, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-surface-800/80 px-4 py-3 pl-10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            <ion-icon name="search" className="text-lg" />
          </span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/40 p-8 text-center text-white/60">
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-8 text-center text-red-200 text-sm">
          {error}
        </div>
      ) : displayList.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface-800/40 p-8 text-center text-white/60">
          {tab === 'yours' ? 'No base personas loaded. Ensure the personas migration is applied.' : 'No personas match your search.'}
        </div>
      ) : (
        <>
          {tab === 'yours' ? (
            <div className="space-y-8">
              <section>
                <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Core personas
                </h2>
                <p className="text-xs text-white/40 mb-4">
                  Everyone has these when they start. Base specialists for legal, financial, technical, business development, and tax.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {corePersonas.map((p) => renderPersonaCard(p, true))}
                </div>
              </section>
              {subPersonas.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                    Sub personas
                  </h2>
                  <p className="text-xs text-white/40 mb-4">
                    Added to your workspace from the marketplace (e.g. Technical → Hydroelectric).
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {subPersonas.map((p) => renderPersonaCard(p, true))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <section>
                <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Marketplace
                </h2>
                <p className="text-xs text-white/40 mb-4">
                  Subpersonas and specialists you can add to your workspace. Same card design as Your personas.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {marketplaceList.map((p) => renderPersonaCard(p, false))}
                </div>
              </section>
            </div>
          )}

          {activeItem && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-surface-900/80 p-4 lg:p-5">
              <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {activeMeta && (
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-semibold text-white shadow-lg"
                      style={{
                        background: `linear-gradient(135deg, ${activeMeta.color}, rgba(15,23,42,0.9))`,
                      }}
                    >
                      {activeMeta.initials}
                    </div>
                  )}
                  <div>
                    <h2 className="text-sm font-semibold text-white">{activeItem.name}</h2>
                    <p className="text-xs text-white/50">
                      {activeDimensions.length > 0
                        ? 'Dimension weights and risk lenses'
                        : tab === 'yours'
                          ? 'Persona details'
                          : [activeItem.domain, activeItem.subdomain].filter(Boolean).join(' · ') || 'Persona details'}
                      {activeDimensions.length > 0 && (activeItem.domain || activeItem.subdomain) && (
                        <span className="text-white/40"> · {[activeItem.domain, activeItem.subdomain].filter(Boolean).join(' / ')}</span>
                      )}
                    </p>
                  </div>
                </div>
                {tab === 'marketplace' && (
                  <button
                    type="button"
                    onClick={() => handleInstall(activeItem.slug)}
                    disabled={installingSlug === activeItem.slug}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-60"
                  >
                    {installingSlug === activeItem.slug ? (
                      <>Adding…</>
                    ) : (
                      <>
                        <ion-icon name="add-circle-outline" className="text-lg" />
                        Add to workspace
                      </>
                    )}
                  </button>
                )}
              </div>
              {activeDimensions.length > 0 && (
                <div className="mt-2 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
                    Dimension weights and risk lenses
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-white/50">
                          <th className="py-2 pr-4 font-medium">Dimension</th>
                          <th className="py-2 pr-4 font-medium w-24 shrink-0">Base weight</th>
                          <th className="py-2 pr-4 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDimensions.map((d) => (
                          <tr key={d.id} className="border-b border-white/5 last:border-0 align-top">
                            <td className="py-2 pr-4 text-white/90">{d.dimension_name}</td>
                            <td className="py-2 pr-4 text-white/80">{(d.base_weight * 100).toFixed(0)}%</td>
                            <td className="py-2 pr-4 text-white/60 whitespace-normal max-w-md">{d.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {activeItem.primary_sources && activeItem.primary_sources.length > 0 && (
                <div className="mt-2 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Primary sources
                  </h3>
                  <p className="text-xs text-white/70">
                    {activeItem.primary_sources.length <= 3
                      ? activeItem.primary_sources.join(', ')
                      : `${activeItem.primary_sources.slice(0, 3).join(', ')} and ${activeItem.primary_sources.length - 3} more`}
                  </p>
                </div>
              )}
              {tab === 'marketplace' && activeDimensions.length === 0 && (activeItem.description || activeItem.domain) && (
                <div className="text-sm text-white/80 space-y-2">
                  {activeItem.description && <p>{activeItem.description}</p>}
                  {(activeItem.domain || activeItem.subdomain) && (
                    <p className="text-xs text-white/50">
                      Domain: {[activeItem.domain, activeItem.subdomain].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
