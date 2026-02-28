import type { PersonaScore } from '../data/mock'

export function PersonaScoreDashboard({ scores }: { scores: PersonaScore[] }) {
  return (
    <div className="rounded-xl bg-surface-800/80 backdrop-blur border border-white/10 p-4 animate-fade-in">
      <h3 className="text-sm font-medium text-white/80 mb-3">Persona scores</h3>
      <div className="space-y-3">
        {scores.map((p, i) => (
          <div
            key={p.personaId}
            className="flex items-center gap-3 animate-fade-in-up"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
          >
            <span className="w-24 text-sm text-white/70 shrink-0">{p.personaName}</span>
            <div className="flex-1 h-6 rounded bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded origin-left animate-bar-fill"
                style={{
                  width: `${(p.score / 10) * 100}%`,
                  backgroundColor: p.color,
                  animationDelay: `${i * 100 + 150}ms`,
                  animationFillMode: 'backwards',
                }}
              />
            </div>
            <span className="text-sm font-medium w-6" style={{ color: p.color }}>{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
