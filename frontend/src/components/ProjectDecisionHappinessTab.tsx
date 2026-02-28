import { getDecisionsByProject, mockSpecialists, mockSpecialistHappiness } from '../data/mock'

export function ProjectDecisionHappinessTab({ projectId }: { projectId: string }) {
  const decisions = getDecisionsByProject(projectId)
  const happiness = mockSpecialistHappiness[projectId] ?? {}

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/60 text-sm">
          Summary of decisions made and how happy each AI specialist is with the project direction.
        </p>
      </div>

      {/* Decisions summary */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
          <ion-icon name="checkmark-circle-outline" />
          {decisions.length} decision{decisions.length !== 1 ? 's' : ''} made
        </h3>
        {decisions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/30 p-8 text-center">
            <ion-icon name="document-outline" className="text-4xl text-white/30 mb-2" />
            <p className="text-white/50 text-sm">No decisions recorded yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-800 border border-white/10"
              >
                <div>
                  <p className="text-white font-medium">{d.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{d.summary}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs bg-white/10 shrink-0">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AI happiness */}
      <div>
        <h3 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
          <ion-icon name="happy-outline" />
          AI specialist happiness
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mockSpecialists.map((s) => {
            const score = happiness[s.id] ?? 5
            const emoji = score >= 8 ? '😊' : score >= 6 ? '🙂' : score >= 4 ? '😐' : '😕'
            return (
              <div
                key={s.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface-800 border border-white/10"
              >
                <div
                  className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-lg font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white" style={{ color: s.color }}>
                    {s.name}
                  </p>
                  <p className="text-sm text-white/60">
                    {emoji} {score}/10
                  </p>
                </div>
                <div className="w-24 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${score * 10}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
