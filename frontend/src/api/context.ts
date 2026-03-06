const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface ContextSource {
  id: string
  project_id: string
  type: 'document' | 'slack' | 'codebase'
  label: string | null
  content: string
  created_at: string
  storage_path?: string | null
  file_name?: string | null
  folder_path?: string | null
  folder_id?: string | null
  version?: number | null
  size_bytes?: number | null
  mime_type?: string | null
}

export interface FolderItem {
  id: string
  project_id: string
  name: string
  parent_id: string | null
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

/** List document files, optionally scoped to a folder. Use folderId = null or '__root__' for root. */
export async function getFiles(projectId: string, folderId?: string | null): Promise<ContextSource[]> {
  const params = new URLSearchParams({ project_id: projectId })
  if (folderId != null && folderId !== '' && folderId !== '__root__') params.set('folder_id', folderId)
  const url = API_BASE ? `${API_BASE}/api/context/files?${params}` : `/api/context/files?${params}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 503) return []
    throw new Error(`Failed to fetch files: ${res.statusText}`)
  }
  return res.json()
}

/** List folders. Use parentId = null or '__root__' for root-level folders. */
export async function getFolders(projectId: string, parentId?: string | null): Promise<FolderItem[]> {
  const params = new URLSearchParams({ project_id: projectId })
  if (parentId != null && parentId !== '' && parentId !== '__root__') params.set('parent_id', parentId)
  const url = API_BASE ? `${API_BASE}/api/context/folders?${params}` : `/api/context/folders?${params}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 503) return []
    throw new Error(`Failed to fetch folders: ${res.statusText}`)
  }
  return res.json()
}

/** Create a folder. parentId = null for root. */
export async function createFolder(
  projectId: string,
  name: string,
  parentId?: string | null
): Promise<FolderItem> {
  const url = API_BASE ? `${API_BASE}/api/context/folders` : '/api/context/folders'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name: name.trim(),
      parent_id: parentId && parentId !== '__root__' ? parentId : null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to create folder')
  }
  return res.json()
}

/** Rename a folder. */
export async function renameFolder(folderId: string, name: string): Promise<FolderItem> {
  const url = API_BASE ? `${API_BASE}/api/context/folders/${folderId}` : `/api/context/folders/${folderId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to rename folder')
  }
  return res.json()
}

/** Rename a document (update label/title). */
export async function renameDocument(sourceId: string, title: string): Promise<ContextSource> {
  const url = API_BASE ? `${API_BASE}/api/context/sources/${sourceId}` : `/api/context/sources/${sourceId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to rename document')
  }
  return res.json()
}

/** Extract text from a file without saving. For use in decision evaluation only. */
export async function extractDocumentText(file: File): Promise<{ content: string; label: string }> {
  const url = API_BASE ? `${API_BASE}/api/context/document/extract-text` : '/api/context/document/extract-text'
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Failed to extract text from file')
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
  permitted_specialists: PermittedSpecialists = 'all',
  folderId?: string | null
): Promise<ContextSource> {
  const url = API_BASE ? `${API_BASE}/api/context/document/upload` : '/api/context/document/upload'
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('file', file)
  if (label != null && label !== '') form.append('label', label)
  form.append('permitted_specialists', JSON.stringify(permitted_specialists))
  if (folderId != null && folderId !== '' && folderId !== '__root__') form.append('folder_id', folderId)
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
