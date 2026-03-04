import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getProjects, type ApiProject } from '../api/projects'

export function Sidebar({ open }: { open: boolean }) {
  const { projectId } = useParams()
  const [projects, setProjects] = useState<ApiProject[]>([])

  useEffect(() => {
    getProjects()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
  }, [])

  return (
    <aside
      className={`${
        open ? 'w-56' : 'w-0'
      } hidden lg:block shrink-0 border-r border-white/10 bg-surface-800/60 backdrop-blur-md overflow-hidden transition-all duration-200`}
    >
      <nav className="p-4 space-y-1">
        <div className="text-xs font-medium text-white/50 uppercase tracking-wider px-3 py-2">Projects</div>
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/project/${p.id}`}
            className={`block px-3 py-2 rounded-lg text-sm transition ${
              projectId === p.id ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
            }`}
          >
            {p.name}
          </Link>
        ))}
        <div className="pt-4 mt-4 border-t border-white/10">
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider px-3 py-2">Filters</div>
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Active</button>
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Completed</button>
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Draft</button>
        </div>
        <div className="pt-4 mt-4 border-t border-white/10">
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Persona Library</button>
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Reports</button>
          <button type="button" className="w-full px-3 py-2 rounded-lg text-left text-sm text-white/80 hover:bg-white/5">Settings</button>
        </div>
      </nav>
    </aside>
  )
}
