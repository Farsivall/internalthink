import { useState } from 'react'
import { mockSpecialists } from '../data/mock'
import type { DecisionEvaluateResponse } from '../api/decision'

/** Display name (from scores) may differ from persona_name in API (e.g. Business Development → Business Dev). */
const SPECIALIST_DISPLAY_TO_PERSONA_NAMES: Record<string, string[]> = {
  'Business Development': ['Business Development', 'Business Dev'],
}

function personaNamesForMatch(displayName: string): string[] {
  return SPECIALIST_DISPLAY_TO_PERSONA_NAMES[displayName] ?? [displayName]
}

function getSpecialistColor(id: string): string {
  const spec = mockSpecialists.find((s) => s.id === id)
  return spec?.color ?? '#6b7280'
}

function getPersonaColorByName(name: string): string {
  const byName: Record<string, string> = {}
  mockSpecialists.forEach((s) => {
    byName[s.name] = s.color
    if (s.name === 'Business Development') byName['Business Dev'] = s.color
  })
  return byName[name] ?? '#6b7280'
}

function ColorCodedText({ text }: { text: string }) {
  const names = mockSpecialists.map((s) => s.name)
  const parts: { str: string; color?: string }[] = []
  let remaining = text
  while (remaining.length > 0) {
    let best: { name: string; index: number } | null = null
    for (const name of names) {
      const i = remaining.indexOf(name)
      if (i !== -1 && (best === null || i < best.index)) best = { name, index: i }
    }
    if (best === null) {
      parts.push({ str: remaining })
      break
    }
    if (best.index > 0) parts.push({ str: remaining.slice(0, best.index) })
    const spec = mockSpecialists.find((s) => s.name === best!.name)
    const color = spec ? getSpecialistColor(spec.id) : undefined
    parts.push({ str: best.name, color })
    remaining = remaining.slice(best.index + best.name.length)
  }
  return (
    <span>
      {parts.map((p, i) =>
        p.color ? (
          <span key={i} className="font-medium" style={{ color: p.color }}>
            {p.str}
          </span>
        ) : (
          <span key={i}>{p.str}</span>
        )
      )}
    </span>
  )
}

export function DecisionBreakdownModal({
  decision,
  onClose,
  branchedDecisions = [],
  onAddBranch,
  parentDecisionId,
}: {
  decision: DecisionEvaluateResponse
  onClose: () => void
  branchedDecisions?: { id: string; title: string }[]
  onAddBranch?: (parentId: string) => void
  parentDecisionId?: string | null
}) {
  const [expandedPersonas, setExpandedPersonas] = useState<Set<string>>(() => new Set())
  const [showDetailedReasoning, setShowDetailedReasoning] = useState(false)

  const togglePersona = (specialistId: string) => {
    setExpandedPersonas((prev) => {
      const next = new Set(prev)
      if (next.has(specialistId)) next.delete(specialistId)
      else next.add(specialistId)
      return next
    })
  }

  const agreementItems = decision.agreement
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const tradeoffItems = decision.tradeoffs
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const personaList =
    (decision.persona_scores?.length ?? 0) > 0
      ? (decision.persona_scores ?? []).map((ps) => ({
          name: ps.persona_name,
          score: ps.total_score,
          id: ps.persona_name,
        }))
      : decision.scores.map((s) => ({
          name: s.specialist_name,
          score: (s.score ?? 5) * 10,
          id: s.specialist_id,
        }))

  const scoreByDisplayName: Record<string, number> = {}
  personaList.forEach((p) => {
    scoreByDisplayName[p.name] = p.score
    if (p.name === 'Business Dev') scoreByDisplayName['Business Development'] = p.score
  })

  const PERSONA_NAMES_FOR_MATCH = ['Legal', 'Financial', 'Technical', 'Business Development', 'Business Dev', 'Tax']

  function formatDisagreeItem(tradeoffText: string): { headline: string; detail: string } {
    const lower = tradeoffText.toLowerCase()
    const found: { name: string; index: number }[] = []
    for (const name of PERSONA_NAMES_FOR_MATCH) {
      const idx = lower.indexOf(name.toLowerCase())
      if (idx !== -1) found.push({ name, index: idx })
    }
    found.sort((a, b) => a.index - b.index)
    const firstTwo = found
      .filter((f, i, arr) => {
        const prev = arr[i - 1]
        if (!prev) return true
        return f.index >= prev.index + prev.name.length
      })
      .slice(0, 2)
    if (firstTwo.length >= 2) {
      const [a, b] = firstTwo
      const scoreA = scoreByDisplayName[a.name] ?? 0
      const scoreB = scoreByDisplayName[b.name] ?? 0
      const headline = `${a.name} (${scoreA}) vs ${b.name} (${scoreB})`
      const splitMatch = tradeoffText.match(/\s+[—–-]\s+/)
      const detail = splitMatch
        ? tradeoffText.slice(tradeoffText.indexOf(splitMatch[0]) + splitMatch[0].length).trim()
        : tradeoffText
      return { headline, detail }
    }
    const [headline, detail] = tradeoffText.split(/:\s+|\s+[—–-]\s+/, 2)
    return { headline: headline?.trim() ?? tradeoffText, detail: detail?.trim() ?? '' }
  }

  const recommendedPath = decision.recommended_path
  const nextSteps = (decision.recommended_path_next_steps ?? []).slice(0, 5)
  const totalScore = personaList.reduce((sum, p) => sum + p.score, 0)
  const MAX_TOTAL = 500

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header: title + total score + attachments */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-white">Decision breakdown</h2>
            <span className="text-sm text-white/70 font-medium">
              Total: {totalScore} / {MAX_TOTAL}
            </span>
            {(decision.attached_labels?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-white/50 uppercase tracking-wider">Attachments:</span>
                {decision.attached_labels!.map((label, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 transition-colors"
            aria-label="Close"
          >
            <ion-icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* 1. Decision summary */}
            <section>
              <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Decision summary
              </p>
              <h3 className="text-lg font-semibold text-white leading-snug">
                {decision.decision_title}
              </h3>
              {(decision.decision_summary || decision.agreement) && (
                <p className="mt-2 text-sm text-white/80 leading-relaxed max-w-2xl">
                  {decision.decision_summary || decision.agreement}
                </p>
              )}
            </section>

            {/* 2. Core tensions */}
            {decision.core_tensions && decision.core_tensions.length > 0 && (
              <section>
                <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-2">
                  Core issues / key tensions
                </p>
                <ul className="space-y-2">
                  {decision.core_tensions.slice(0, 4).map((t, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-white/90 leading-relaxed"
                    >
                      <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 3. Expert alignment: agree + disagree */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-medium text-emerald-400/90 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  What experts agree on
                </p>
                <ul className="space-y-1.5 text-sm text-white/85">
                  {agreementItems.slice(0, 4).map((s, i) => (
                    <li key={i} className="leading-relaxed">
                      <ColorCodedText text={s} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-medium text-amber-400/90 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Where experts disagree
                </p>
                <ul className="space-y-1.5 text-sm text-white/85">
                  {tradeoffItems.slice(0, 4).map((s, i) => {
                    const { headline, detail } = formatDisagreeItem(s)
                    const cardShades = ['bg-white/[0.07]', 'bg-white/[0.04]', 'bg-white/[0.07]', 'bg-white/[0.04]']
                    return (
                      <li key={i} className={`rounded-lg border border-white/10 px-3 py-2 leading-relaxed ${cardShades[i % cardShades.length]}`}>
                        <span className="font-semibold text-white/95">
                          <ColorCodedText text={headline} />
                        </span>
                        {detail && (
                          <span className="text-white/75"> — <ColorCodedText text={detail} /></span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>

            {/* 4. Recommended path (prominent) */}
            {recommendedPath && (
              <section className="rounded-xl border-2 border-emerald-500/40 bg-emerald-950/25 p-5">
                <p className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider mb-2">
                  Recommended path
                </p>
                {recommendedPath.title && (
                  <h4 className="text-base font-semibold text-white">{recommendedPath.title}</h4>
                )}
                {recommendedPath.why_best && (
                  <p className="mt-2 text-sm text-white/90 leading-relaxed">
                    {recommendedPath.why_best}
                  </p>
                )}
              </section>
            )}

            {/* 5. Paths forward (cards) */}
            {decision.paths && decision.paths.length > 0 && (
              <section>
                <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-3">
                  Paths forward
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {decision.paths.map((path) => (
                    <div
                      key={path.id}
                      className="rounded-xl border border-white/10 bg-surface-700/50 p-4 flex flex-col"
                    >
                      <h5 className="text-sm font-semibold text-white">{path.title}</h5>
                      {path.description && (
                        <p className="mt-1.5 text-xs text-white/75 leading-relaxed line-clamp-3">
                          {path.description}
                        </p>
                      )}
                      {path.favored_by && path.favored_by.length > 0 && (
                        <p className="mt-3 text-[11px] text-white/60 flex flex-wrap gap-1.5 items-center">
                          <span className="text-white/50">Favored by:</span>
                          {path.favored_by.map((f, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded font-medium"
                              style={{
                                color: getPersonaColorByName(f.persona),
                                backgroundColor: `${getPersonaColorByName(f.persona)}20`,
                              }}
                            >
                              {f.persona}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 6. Next steps */}
            {nextSteps.length > 0 && (
              <section>
                <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-2">
                  Next steps
                </p>
                <ul className="space-y-2">
                  {nextSteps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-white/90"
                    >
                      <span className="text-white/50 font-mono text-xs w-5 shrink-0">{i + 1}.</span>
                      <span>{step.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 7. Persona score snapshot (compact) */}
            <section>
              <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-3">
                Persona score snapshot
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {personaList.map(({ name, score, id }) => {
                  const color =
                    (decision.persona_scores?.length ?? 0) > 0
                      ? getPersonaColorByName(name)
                      : getSpecialistColor(id)
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm text-white/90 w-24 truncate" style={{ color }}>
                        {name}
                      </span>
                      <span className="text-sm font-semibold text-white tabular-nums">{score}</span>
                    </div>
                  )
                })}
              </div>
              {/* Score bar: segments proportional to score */}
              <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-white/10">
                {personaList.map(({ score, id, name }) => {
                  const color =
                    (decision.persona_scores?.length ?? 0) > 0
                      ? getPersonaColorByName(name)
                      : getSpecialistColor(id)
                  const total = personaList.reduce((a, p) => a + p.score, 0) || 1
                  const pct = (score / total) * 100
                  return (
                    <div
                      key={id}
                      className="transition-all first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        minWidth: '6px',
                      }}
                      title={`${name}: ${score}`}
                    />
                  )
                })}
              </div>
            </section>

            {/* Branched decisions + Make your own branch */}
            {(branchedDecisions.length > 0 || (parentDecisionId && onAddBranch)) && (
              <section className="pt-2 border-t border-white/10">
                {branchedDecisions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1.5">
                      Branched from this
                    </p>
                    <ul className="text-sm text-white/80 space-y-0.5">
                      {branchedDecisions.map((b) => (
                        <li key={b.id}>{b.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {parentDecisionId && onAddBranch && (
                  <button
                    type="button"
                    onClick={() => onAddBranch(parentDecisionId)}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-white/30 bg-white/5 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:border-white/40 transition-colors"
                  >
                    <ion-icon name="add-circle-outline" className="text-lg" />
                    Make your own branch
                  </button>
                )}
              </section>
            )}

            {/* 8. Detailed persona reasoning (collapsible) */}
            <section>
              <button
                type="button"
                onClick={() => setShowDetailedReasoning((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
              >
                <ion-icon
                  name={showDetailedReasoning ? 'chevron-down' : 'chevron-forward'}
                  className="text-lg"
                />
                {showDetailedReasoning ? 'Hide' : 'Show'} detailed persona reasoning
              </button>
              {showDetailedReasoning && (
                <div className="mt-4 space-y-3">
                  {decision.scores.map((s) => {
                    const color = getSpecialistColor(s.specialist_id)
                    const matchNames = personaNamesForMatch(s.specialist_name)
                    const personaScore = decision.persona_scores?.find((ps) =>
                      matchNames.includes(ps.persona_name)
                    )
                    const displayScore = personaScore != null ? personaScore.total_score : (s.score ?? 0) * 10
                    const isExpanded = expandedPersonas.has(s.specialist_id)
                    return (
                      <div
                        key={s.specialist_id}
                        className="rounded-xl bg-surface-700/80 border border-white/10 overflow-hidden"
                        style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                      >
                        <button
                          type="button"
                          onClick={() => togglePersona(s.specialist_id)}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                        >
                          <ion-icon
                            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                            className="text-lg text-white/60 shrink-0"
                          />
                          <span className="text-sm font-semibold shrink-0" style={{ color }}>
                            {s.specialist_name}
                          </span>
                          <span className="text-xs text-white/50">Score</span>
                          <span className="text-sm font-bold text-white tabular-nums">
                            {displayScore}/100
                          </span>
                          {personaScore?.high_structural_risk && (
                            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              High structural risk
                            </span>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="space-y-3 text-xs leading-relaxed px-4 pb-4 pt-0 border-t border-white/10">
                            <div>
                              <p className="text-white/50 mb-0.5">Summary</p>
                              <p className="text-white/85">{s.summary}</p>
                            </div>
                            {s.objections.length > 0 && (
                              <div>
                                <p className="text-white/50 mb-0.5">Key risks / objections</p>
                                <ul className="list-disc list-inside text-white/75 space-y-0.5">
                                  {s.objections.map((o, i) => (
                                    <li key={i}>{o}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {personaScore?.dimensions?.length > 0 && (
                              <div>
                                <p className="text-white/50 mb-1">Dimension scores</p>
                                <ul className="space-y-1.5">
                                  {personaScore.dimensions.map((dim, i) => (
                                    <li
                                      key={i}
                                      className="rounded border border-white/10 bg-white/5 px-2 py-1.5"
                                    >
                                      <span className="font-medium text-white/90">{dim.Name}</span>
                                      <span className="text-white/60 ml-1">({dim.Score})</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {personaScore?.what_would_change_my_mind?.length > 0 && (
                              <div>
                                <p className="text-white/50 mb-0.5">What would change my mind</p>
                                <ul className="list-disc list-inside text-white/75 space-y-0.5">
                                  {personaScore.what_would_change_my_mind.map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
