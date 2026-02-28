const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface ContextSource {
  id: string
  project_id: string
  type: 'document' | 'slack' | 'codebase'
  label: string | null
  content: string
  created_at: string
}

/** "all" or list of specialist ids (e.g. ["legal", "financial"]) */
export type PermittedSpecialists = 'all' | string[]

export async function getContextSources(projectId: string): Promise<ContextSource[]> {
  const url = API_BASE ? `${API_BASE}/api/context?project_id=${encodeURIComponent(projectId)}` : `/api/context?project_id=${encodeURIComponent(projectId)}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 503) throw new Error('Supabase not configured')
    throw new Error(`Failed to fetch context: ${res.statusText}`)
  }
  return res.json()
}

export async function addDocumentText(
  projectId: string,
  content: string,
  label?: string | null,
  permitted_specialists: PermittedSpecialists = 'all'
): Promise<ContextSource> {
  const url = API_BASE ? `${API_BASE}/api/context/document` : '/api/context/document'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content,
      label: label ?? undefined,
      permitted_specialists,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to add document')
  }
  return res.json()
}

export async function uploadDocument(
  projectId: string,
  file: File,
  label?: string | null,
  permitted_specialists: PermittedSpecialists = 'all'
): Promise<ContextSource> {
  const url = API_BASE ? `${API_BASE}/api/context/document/upload` : '/api/context/document/upload'
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('file', file)
  if (label != null && label !== '') form.append('label', label)
  form.append('permitted_specialists', JSON.stringify(permitted_specialists))
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to upload document')
  }
  return res.json()
}

export async function addGitHubContext(
  projectId: string,
  repo_url: string,
  label?: string | null,
  permitted_specialists: PermittedSpecialists = 'all'
): Promise<ContextSource> {
  const url = API_BASE ? `${API_BASE}/api/context/github` : '/api/context/github'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      repo_url,
      label: label ?? undefined,
      permitted_specialists,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to add codebase context')
  }
  return res.json()
}
