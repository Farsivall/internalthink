import { useEffect, useMemo, useState } from 'react'
import { getPersonaDimensions, type PersonaDimension } from '../api/personas'
import { mockSpecialists } from '../data/mock'

type PersonaMeta = {
  id: string
  name: string
  color: string
  initials: string
}

const PERSONA_ORDER: string[] = ['Legal', 'Financial', 'Technical', 'Business Dev', 'Tax']

function buildPersonaMeta(): Record<string, PersonaMeta> {
  const byName: Record<string, PersonaMeta> = {}
  for (const s of mockSpecialists) {
    byName[s.name] = {
      id: s.id,
      name: s.name,
      color: s.color,
      initials: s.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    }
  }
  // Business Dev uses \"Business Development\" in mockSpecialists
  if (byName['Business Development'] && !byName['Business Dev']) {
    const bd = byName['Business Development']
    byName['Business Dev'] = { ...bd, name: 'Business Dev' }
  }
  return byName
}

export function Personas() {
  const [dimensions, setDimensions] = useState<PersonaDimension[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePersona, setActivePersona] = useState<string | null>(null)

  const personaMeta = useMemo(buildPersonaMeta, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPersonaDimensions()
      .then((data) => {
        setDimensions(data)
        if (data.length > 0 && !activePersona) {
          setActivePersona(data[0].persona_name)
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load personas')
      })
      .finally(() => setLoading(false))
  }, [])

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

  const personasInOrder = PERSONA_ORDER.filter((name) => byPersona.has(name)).concat(
    Array.from(byPersona.keys()).filter((name) => !PERSONA_ORDER.includes(name))
  )

  const activeDimensions = activePersona ? byPersona.get(activePersona) ?? [] : []
  const activeMeta = activePersona ? personaMeta[activePersona] : undefined

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Persona library</h1>
          <p className="text-sm text-white/60">
            All AI specialists, their scoring dimensions, and risk weightings.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/40 p-8 text-center text-white/60">
          Loading personas…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-8 text-center text-red-200 text-sm">
          Could not load personas: {error}
        </div>
      ) : (
        <>
          {/* Persona grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personasInOrder.map((name) => {
              const meta = personaMeta[name]
              const dims = byPersona.get(name) ?? []
              const selected = activePersona === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActivePersona(name)}
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
                      {meta?.initials ?? name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white flex items-center gap-2">
                        {name}
                        {selected && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-accent-cyan/15 text-accent-cyan">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                            Active
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-white/50">
                        {dims.length} dimension{dims.length !== 1 ? 's' : ''} · weighted scoring
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 w-full h-1.5 rounded-full bg-surface-700 overflow-hidden">
                    <div
                      className="h-full rounded-full group-hover:scale-x-105 origin-left transition-transform"
                      style={{ backgroundColor: meta?.color ?? '#22c55e', width: '100%' }}
                    />
                  </div>
                  {dims.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-white/60 w-full">
                      {dims.slice(0, 3).map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{d.dimension_name}</span>
                          <span className="shrink-0 text-white/50">{(d.base_weight * 100).toFixed(0)}%</span>
                        </li>
                      ))}
                      {dims.length > 3 && (
                        <li className="text-[11px] text-white/40">
                          +{dims.length - 3} more dimension{dims.length - 3 !== 1 ? 's' : ''}
                        </li>
                      )}
                    </ul>
                  )}
                </button>
              )
            })}
          </div>

          {/* Detail panel for active persona */}
          {activePersona && activeDimensions.length > 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-surface-900/80 p-4 lg:p-5">
              <div className="flex items-center justify-between gap-4 mb-4">
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
                    <h2 className="text-sm font-semibold text-white">{activePersona}</h2>
                    <p className="text-xs text-white/50">Dimension weights and risk lenses</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50">
                      <th className="py-2 pr-4 font-medium">Dimension</th>
                      <th className="py-2 pr-4 font-medium">Base weight</th>
                      <th className="py-2 pr-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDimensions.map((d) => (
                      <tr key={d.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 pr-4 text-white/90">{d.dimension_name}</td>
                        <td className="py-2 pr-4 text-white/80">{(d.base_weight * 100).toFixed(0)}%</td>
                        <td className="py-2 pr-4 text-white/60">{d.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

