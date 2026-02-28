import { Link } from 'react-router-dom'

export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/25 bg-surface-800/40 backdrop-blur-sm p-12 text-center animate-scale-in">
      <p className="text-white/80 text-lg">
        No projects yet. Start by creating a project to add a summary, attach documents, and choose which agents can see each.
      </p>
      <Link
        to="/project/new"
        className="mt-6 inline-flex px-6 py-3 rounded-lg bg-accent-blue text-white font-medium hover:bg-accent-blue/90 hover:scale-105 active:scale-100 transition-all duration-200"
      >
        New Project
      </Link>
    </div>
  )
}
