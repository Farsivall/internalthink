const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface ApiProject {
  id: string
  name: string
  description: string | null
  slug: string | null
  created_at: string
}

export async function getProjects(): Promise<ApiProject[]> {
  const url = API_BASE ? `${API_BASE}/api/projects` : '/api/projects'
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 503) throw new Error('Supabase not configured')
    throw new Error(`Failed to fetch projects: ${res.statusText}`)
  }
  return res.json()
}

export async function getProject(idOrSlug: string): Promise<ApiProject> {
  const url = API_BASE ? `${API_BASE}/api/projects/${encodeURIComponent(idOrSlug)}` : `/api/projects/${encodeURIComponent(idOrSlug)}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Project not found')
    if (res.status === 503) throw new Error('Supabase not configured')
    throw new Error(`Failed to fetch project: ${res.statusText}`)
  }
  return res.json()
}
