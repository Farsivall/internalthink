import { mockProjects } from '../data/mock'
import { ProjectCard } from '../components/ProjectCard'
import { EmptyState } from '../components/EmptyState'

export function Home() {
  const hasProjects = mockProjects.length > 0
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-semibold text-white mb-2">Projects</h1>
      <p className="text-white/60 mb-8">Each project contains decisions, documents, and persona simulations.</p>
      {hasProjects ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {mockProjects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
