import { Link } from 'react-router-dom'
import type { Project } from '../data/mock'

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function DocStackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  )
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7" />
      <path d="M17 7h-6v6" />
    </svg>
  )
}

const statusStyles: Record<string, string> = {
  Active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40',
  Completed: 'bg-white/10 text-white/80 border border-white/20',
  Draft: 'bg-amber-500/15 text-amber-400 border border-amber-500/40',
}

export function ProjectCard({ project, index = 0 }: { project: Project; index?: number }) {
  const statusClass = statusStyles[project.status] ?? statusStyles.Draft
  return (
    <Link
      to={`/project/${project.id}`}
      className="flex flex-col rounded-xl border border-white/10 hover:border-emerald-500/30 bg-surface-800 transition-all duration-300 group animate-fade-in-up h-full min-h-[220px]"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'backwards' }}
    >
      {/* Top row: icon + status + expand */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className={`rounded-lg p-2 bg-surface-700 border border-white/10 ${project.iconColor}`}>
          <FolderIcon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass}`}>
            {project.status}
          </span>
          <span className="p-1.5 rounded-full bg-surface-700 text-emerald-400/80 group-hover:text-emerald-400 transition-colors" aria-hidden>
            <ExpandIcon />
          </span>
        </div>
      </div>
      {/* Title */}
      <h3 className="px-4 pt-1 font-semibold text-lg text-white group-hover:text-amber-400/90 transition-colors">
        {project.name}
      </h3>
      {/* Summary block - vertical emphasis */}
      <div className="flex-1 px-4 py-3">
        <p className="text-sm text-white/60 line-clamp-3 leading-relaxed">
          {project.description}
        </p>
      </div>
      {/* Footer metadata */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <DocStackIcon className="text-emerald-400/70 shrink-0" />
          {project.decisionCount} decisions
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="text-emerald-400/70 shrink-0" />
          Updated {project.updatedAt}
        </span>
      </div>
    </Link>
  )
}
