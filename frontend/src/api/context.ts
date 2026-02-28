const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface ContextSource {
  id: string
  project_id: string
  type: 'document' | 'slack' | 'codebase'
  label: string | null
  content: string
  created_at: string
}

export async function getContextSources(projectId: string): Promise<ContextSource[]> {
  const url = API_BASE ? `${API_BASE}/api/context?project_id=${encodeURIComponent(projectId)}` : `/api/context?project_id=${encodeURIComponent(projectId)}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 503) throw new Error('Supabase not configured')
    throw new Error(`Failed to fetch context: ${res.statusText}`)
  }
  return res.json()
}
