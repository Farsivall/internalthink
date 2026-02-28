import { useParams, Link } from 'react-router-dom'
import { getProject, getDecision, getThread } from '../data/mock'
import { PersonaScoreDashboard } from '../components/PersonaScoreDashboard'
import { PersonaChatPanel } from '../components/PersonaChatPanel'
import { AttachmentsSection } from '../components/AttachmentsSection'

export function DecisionDetail() {
  const { projectId, decisionId } = useParams<{ projectId: string; decisionId: string }>()
  const project = projectId ? getProject(projectId) : null
  const decision = projectId && decisionId ? getDecision(projectId, decisionId) : null

  const threadsByPersona: Record<string, ReturnType<typeof getThread>> = {}
  if (decision && decisionId) {
    decision.personaScores.forEach((p) => {
      threadsByPersona[p.personaId] = getThread(decisionId, p.personaId)
    })
  }

  if (!project || !decision) {
    return (
      <div className="text-center py-12 text-white/60">
        Decision not found. <Link to="/" className="text-accent-blue hover:underline">Back to projects</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <Link to={`/project/${projectId}`} className="text-sm text-white/60 hover:text-accent-cyan mb-2 inline-block">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{decision.title}</h1>
        <span className="mt-2 inline-block px-2 py-0.5 rounded bg-white/10 text-sm">{decision.status}</span>
      </div>

      <section>
        <h2 className="text-lg font-medium text-white mb-2">Summary</h2>
        <p className="text-white/80">{decision.summary}</p>
        {decision.risks.length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <h3 className="text-sm font-medium text-amber-300 mb-2">Risks / objections</h3>
            <ul className="list-disc list-inside text-sm text-white/80">
              {decision.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <PersonaScoreDashboard scores={decision.personaScores} />

      <section>
        <h2 className="text-lg font-medium text-white mb-3">Persona chat</h2>
        <PersonaChatPanel
          personas={decision.personaScores}
          threadsByPersona={threadsByPersona}
        />
      </section>

      <AttachmentsSection docCount={decision.docCount} slideCount={decision.slideCount} />

      <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
        <button type="button" className="px-4 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/15">
          Flag evidence gaps
        </button>
        <button type="button" className="px-4 py-2 rounded-lg bg-accent-blue text-sm text-white hover:bg-accent-blue/90">
          Export summary
        </button>
      </div>
    </div>
  )
}
