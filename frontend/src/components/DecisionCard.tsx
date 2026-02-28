import { Link } from 'react-router-dom'
import type { Decision } from '../data/mock'

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function SlideIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  )
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const statusStyles: Record<string, string> = {
  Draft: 'bg-white/10 text-white/70 border border-white/20',
  Evaluated: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40',
  Reviewed: 'bg-violet-500/15 text-violet-400 border border-violet-500/40',
}

const riskDot: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-emerald-400/80',
}

export function DecisionCard({ decision, projectId, index = 0 }: { decision: Decision; projectId: string; index?: number }) {
  const statusClass = statusStyles[decision.status] ?? statusStyles.Draft
  const dotColor = riskDot[decision.riskLevel ?? 'low'] ?? riskDot.low
  return (
    <Link
      to={`/project/${projectId}/decision/${decision.id}`}
      className="flex flex-col rounded-xl border border-white/10 hover:border-emerald-500/25 bg-surface-800 transition-all duration-300 group animate-fade-in-up h-full min-h-[200px]"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'backwards' }}
    >
      {/* Top: risk dot + title + status */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden />
            <h3 className="font-medium text-white group-hover:text-amber-400/90 transition-colors">
              {decision.title}
            </h3>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium border shrink-0 ${statusClass}`}>
          {decision.status}
        </span>
      </div>
      {/* Summary - vertical block */}
      <div className="px-4 py-2 flex-1">
        <p className="text-sm text-white/60 line-clamp-2 leading-relaxed">
          {decision.summary}
        </p>
      </div>
      {/* Persona scores - compact row */}
      <div className="px-4 flex flex-wrap gap-1.5">
        {decision.personaScores.map((p) => (
          <span
            key={p.personaId}
            className="text-xs px-2 py-0.5 rounded border border-white/10 border-l-2 text-white/55"
            style={{ borderLeftColor: p.color }}
            title={p.summary}
          >
            {p.personaName}: {p.score}
          </span>
        ))}
      </div>
      {/* Risks - short list */}
      {decision.risks.length > 0 && (
        <ul className="px-4 py-1 text-xs text-white/45 list-disc list-inside">
          {decision.risks.slice(0, 2).map((r, i) => (
            <li key={i} className="truncate">{r}</li>
          ))}
        </ul>
      )}
      {/* Footer metadata */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-white/5 text-xs text-white/45">
        <span className="flex items-center gap-1"><DocIcon className="text-emerald-400/60" />{decision.docCount}</span>
        <span className="flex items-center gap-1"><SlideIcon className="text-emerald-400/60" />{decision.slideCount}</span>
        <span className="flex items-center gap-1"><ChatIcon className="text-emerald-400/60" />{decision.chatThreadCount}</span>
        <span>Updated {decision.updatedAt}</span>
      </div>
    </Link>
  )
}
