export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/25 bg-surface-800/40 backdrop-blur-sm p-12 text-center animate-scale-in">
      <p className="text-white/80 text-lg">
        No projects yet. Start by creating a project to add decisions, attach documents, and simulate persona judgment.
      </p>
      <button
        type="button"
        className="mt-6 px-6 py-3 rounded-lg bg-accent-blue text-white font-medium hover:bg-accent-blue/90 hover:scale-105 active:scale-100 transition-all duration-200"
      >
        New Project
      </button>
    </div>
  )
}
