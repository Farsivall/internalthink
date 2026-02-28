import { useState, useEffect } from 'react'
import { getProjects } from '../api/projects'
import type { ApiProject } from '../api/projects'
import { mockProjects } from '../data/mock'
import type { Project } from '../data/mock'
import { ProjectCard } from '../components/ProjectCard'
import { EmptyState } from '../components/EmptyState'

const ICON_COLORS = ['text-emerald-400', 'text-violet-400', 'text-amber-400', 'text-cyan-400', 'text-rose-400']

function toProject(p: ApiProject, index: number): Project {
  const created = p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : ''
  return {
    id: p.slug ?? p.id,
    name: p.name,
    description: p.description ?? '',
    status: 'Active',
    decisionCount: 0,
    updatedAt: created,
    createdAt: created,
    iconColor: ICON_COLORS[index % ICON_COLORS.length],
  }
}

export function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProjects()
      .then((data) => setProjects(data.map((p, i) => toProject(p, i))))
      .catch(() => setProjects(mockProjects))
      .finally(() => setLoading(false))
  }, [])

  const hasProjects = projects.length > 0
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-semibold text-white mb-2">Projects</h1>
      <p className="text-white/60 mb-8">Each project contains decisions, documents, and persona simulations.</p>
      {loading ? (
        <div className="text-white/50 py-8">Loading projects…</div>
      ) : hasProjects ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
