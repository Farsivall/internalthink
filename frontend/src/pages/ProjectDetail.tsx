import { useParams, Link } from 'react-router-dom'
import { getProject, getDecisionsByProject } from '../data/mock'
import { DecisionCard } from '../components/DecisionCard'

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const project = projectId ? getProject(projectId) : null
  const decisions = projectId ? getDecisionsByProject(projectId) : []

  if (!project) {
    return (
      <div className="text-center py-12 text-white/60">
        Project not found. <Link to="/" className="text-accent-blue hover:underline">Back to projects</Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 text-white/60">{project.description}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-white/10 text-sm">{project.status}</span>
            <button type="button" className="text-sm text-white/60 hover:text-white">Edit project</button>
          </div>
        </div>
        <button type="button" className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90">
          Add New Decision
        </button>
      </div>
      <h2 className="text-lg font-medium text-white mb-4">Decisions</h2>
      {decisions.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {decisions.map((d, i) => (
            <DecisionCard key={d.id} decision={d} projectId={project.id} index={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/30 p-8 text-center text-white/60">
          No decisions yet. Add a decision to attach documents, run persona chats, and view scores.
        </div>
      )}
    </div>
  )
}
