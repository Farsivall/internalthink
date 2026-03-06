import { useState, useMemo } from 'react'
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

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function DecisionPieChart({ decision }: { decision: DecisionEvaluateResponse }) {
  const segmentData = useMemo(() => {
    let cumulative = 0
    const total =
      decision.scores.reduce((sum, s) => {
        const matchNames = personaNamesForMatch(s.specialist_name)
        const personaScore = decision.persona_scores?.find((ps) =>
          matchNames.includes(ps.persona_name)
        )
        const value = personaScore != null ? personaScore.total_score : Math.max(s.score * 10, 0)
        return sum + Math.max(value, 0)
      }, 0) || 1
    return decision.scores.map((s) => {
      const matchNames = personaNamesForMatch(s.specialist_name)
      const personaScore = decision.persona_scores?.find((ps) =>
        matchNames.includes(ps.persona_name)
      )
      const value = personaScore != null ? personaScore.total_score : Math.max(s.score * 10, 0)
      const safeValue = Math.max(value, 0)
      const startAngle = (cumulative / total) * 360
      const endAngle = ((cumulative + safeValue) / total) * 360
      cumulative += safeValue
      const midAngle = (startAngle + endAngle) / 2
      const labelPos = polarToCartesian(60, 60, 48 * 0.55, midAngle)
      return {
        ...s,
        startAngle,
        endAngle,
        value: safeValue,
        labelPos,
        color: getSpecialistColor(s.specialist_id),
      }
    })
  }, [decision.scores, decision.persona_scores])

  const cx = 60
  const cy = 60
  const r = 48

  const segments = segmentData.map((s) => {
    const largeArc = s.endAngle - s.startAngle > 180 ? 1 : 0
    const start = polarToCartesian(cx, cy, r, s.endAngle)
    const end = polarToCartesian(cx, cy, r, s.startAngle)
    const d = [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      'Z',
    ].join(' ')
    return (
      <g key={s.specialist_id}>
        <path d={d} fill={s.color} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
        <text
          x={s.labelPos.x}
          y={s.labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white text-[10px] font-bold"
          style={{ textShadow: '0 0 2px rgba(0,0,0,0.8)' }}
        >
          {s.value}
        </text>
      </g>
    )
  })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-36 h-36 shrink-0">
        <g>{segments}</g>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[11px]">
        {segmentData.map((s) => (
          <span key={s.specialist_id} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-white/90">{s.specialist_name}</span>
            <span className="text-white/60">({s.value})</span>
          </span>
        ))}
      </div>
    </div>
  )
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
}: {
  decision: DecisionEvaluateResponse
  onClose: () => void
}) {
  const [expandedPersonas, setExpandedPersonas] = useState<Set<string>>(() => new Set())

  const togglePersona = (specialistId: string) => {
    setExpandedPersonas((prev) => {
      const next = new Set(prev)
      if (next.has(specialistId)) next.delete(specialistId)
      else next.add(specialistId)
      return next
    })
  }

  const agreementItems = decision.agreement
    .split(/[\.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const tradeoffItems = decision.tradeoffs
    .split(/[\.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Decision breakdown</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70"
          >
            <ion-icon name="close" className="text-lg" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <p className="text-xs text-white/50 mb-1">Decision</p>
            <p className="text-sm font-medium text-white">{decision.decision_title}</p>
          </div>

          <div className="space-y-5">
            <div className="flex justify-center">
              <DecisionPieChart decision={decision} />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-white/70 mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                  What they agree on
                </p>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="divide-y divide-white/10">
                    {agreementItems.map((s, i) => (
                      <div key={i} className="px-3 py-2.5 text-sm text-white/85 leading-relaxed">
                        <ColorCodedText text={s} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-white/70 mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                  Tradeoffs between departments
                </p>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="divide-y divide-white/10">
                    {tradeoffItems.map((s, i) => {
                      const [headline, detail] = s.split(/:\s+/, 2)
                      return (
                        <div key={i} className="px-3 py-2.5 text-sm text-white/85 leading-relaxed space-y-1">
                          <p className="font-medium">
                            <ColorCodedText text={headline ?? s} />
                          </p>
                          {detail && (
                            <p className="text-white/80">
                              <ColorCodedText text={detail} />
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-white/50 mb-2">Per-persona breakdown (by specialism)</p>
            <div className="space-y-2">
              {decision.scores.map((s) => {
                const color = getSpecialistColor(s.specialist_id)
                const matchNames = personaNamesForMatch(s.specialist_name)
                const personaScore = decision.persona_scores?.find((ps) =>
                  matchNames.includes(ps.persona_name)
                )
                const displayScore = personaScore != null ? personaScore.total_score : s.score * 10
                const isExpanded = expandedPersonas.has(s.specialist_id)
                return (
                  <div
                    key={s.specialist_id}
                    className="rounded-xl bg-surface-700/80 border border-white/10 overflow-hidden"
                    style={{ borderLeft: `4px solid ${color}` }}
                  >
                    <button
                      type="button"
                      onClick={() => togglePersona(s.specialist_id)}
                      className="w-full flex items-center gap-2 p-4 text-left hover:bg-white/5 transition-colors"
                    >
                      <ion-icon
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        className="text-lg text-white/60 shrink-0"
                      />
                      <span
                        className="text-sm font-semibold text-white shrink-0"
                        style={{ color }}
                      >
                        {s.specialist_name}
                      </span>
                      <span className="text-xs text-white/50">Score (0–100)</span>
                      <span className="text-sm font-bold text-white">
                        {displayScore}/100
                      </span>
                      {personaScore?.high_structural_risk && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          High structural risk
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="space-y-2.5 text-xs leading-relaxed px-4 pb-4 pt-0 border-t border-white/10">
                        <div>
                          <p className="text-white/50 mb-0.5">Score explanation</p>
                          <p className="text-white/85 leading-relaxed">{s.summary}</p>
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
                        {personaScore && personaScore.dimensions.length > 0 && (
                          <div>
                            <p className="text-white/50 mb-1">Dimension scores</p>
                            <ul className="space-y-1.5">
                              {personaScore.dimensions.map((dim, i) => (
                                <li key={i} className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
                                  <span className="font-medium text-white/90">{dim.Name}</span>
                                  <span className="text-white/60 ml-1">({dim.Score}/100)</span>
                                  {(dim.KeyRisks?.length || dim.EvidenceGaps?.length || dim.TradeOffs?.length) > 0 && (
                                    <ul className="mt-1 ml-2 text-white/70 space-y-0.5">
                                      {dim.KeyRisks?.map((r, j) => (
                                        <li key={`r-${j}`}>Risk: {r}</li>
                                      ))}
                                      {dim.EvidenceGaps?.map((g, j) => (
                                        <li key={`g-${j}`}>Evidence gap: {g}</li>
                                      ))}
                                      {dim.TradeOffs?.map((t, j) => (
                                        <li key={`t-${j}`}>Trade-off: {t}</li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {personaScore && personaScore.what_would_change_my_mind.length > 0 && (
                          <div>
                            <p className="text-white/50 mb-0.5">What would change my mind</p>
                            <ul className="list-disc list-inside text-white/75 space-y-0.5">
                              {personaScore.what_would_change_my_mind.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(!personaScore || personaScore.what_would_change_my_mind.length === 0) && (
                          <div>
                            <p className="text-white/50 mb-0.5">Conditions that could change assessment</p>
                            <p className="text-white/60">—</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
