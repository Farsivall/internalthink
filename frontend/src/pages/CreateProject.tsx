import { useState, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createProject } from '../api/projects'
import { addDocumentText, uploadDocument, addGitHubContext, createFolder } from '../api/context'
import type { PermittedSpecialists } from '../api/context'
import { mockSpecialists } from '../data/mock'
import { getDroppedFilesAndFolders, getOrderedFolderPaths } from '../utils/folderDrop'

const ROOT_ID = '__root__'

type FolderEntry = {
  id: string
  name: string
  parentId: string | null
}

type DocEntry = {
  id: string
  mode: 'paste' | 'file'
  content: string
  file: File | null
  label: string
  permitted: PermittedSpecialists
  folderId: string | null
}

const INITIAL_DOC: DocEntry = {
  id: crypto.randomUUID(),
  mode: 'paste',
  content: '',
  file: null,
  label: '',
  permitted: 'all',
  folderId: null,
}

const ACCEPT_FILES = '.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function CreateProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(ROOT_ID)
  const [documents, setDocuments] = useState<DocEntry[]>([{ ...INITIAL_DOC, id: crypto.randomUUID(), folderId: null }])
  const [githubUrl, setGithubUrl] = useState('')
  const [githubLabel, setGithubLabel] = useState('')
  const [githubPermitted, setGithubPermitted] = useState<PermittedSpecialists>('all')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [processingFolderDrop, setProcessingFolderDrop] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addDocument = useCallback(() => {
    const folderId = currentFolderId === ROOT_ID ? null : currentFolderId
    setDocuments((d) => [...d, { ...INITIAL_DOC, id: crypto.randomUUID(), folderId }])
  }, [currentFolderId])

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    const folderId = currentFolderId === ROOT_ID ? null : currentFolderId
    setDocuments((d) => [
      ...d,
      ...list.map((file) => ({
        ...INITIAL_DOC,
        id: crypto.randomUUID(),
        mode: 'file' as const,
        file,
        label: file.name || '',
        permitted: 'all' as PermittedSpecialists,
        folderId,
      })),
    ])
  }, [currentFolderId])

  const removeDocument = (id: string) => {
    setDocuments((d) => d.filter((x) => x.id !== id))
  }

  const updateDoc = (id: string, patch: Partial<DocEntry>) => {
    setDocuments((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      setError(null)
      ;(async () => {
        const result = await getDroppedFilesAndFolders(e.dataTransfer)
        if (result.files.length === 0) return

        if (result.isFolderDrop && result.rootName) {
          setProcessingFolderDrop(true)
          const pathToTempId: Record<string, string> = {}
          const rootId = crypto.randomUUID()
          const newFolders: FolderEntry[] = [
            { id: rootId, name: result.rootName!, parentId: currentFolderId === ROOT_ID ? null : currentFolderId },
          ]
          pathToTempId[result.rootName] = rootId

          const orderedPaths = getOrderedFolderPaths(
            result.files.map((x) => x.relativePath),
            result.rootName
          )
          for (const folderPath of orderedPaths) {
            const parts = folderPath.split('/')
            const name = parts[parts.length - 1]
            const parentPath = parts.slice(0, -1).join('/')
            const parentId = parentPath ? pathToTempId[parentPath] : pathToTempId[result.rootName]
            const id = crypto.randomUUID()
            newFolders.push({ id, name, parentId })
            pathToTempId[folderPath] = id
          }
          setFolders((f) => [...f, ...newFolders])

          const folderId = currentFolderId === ROOT_ID ? null : currentFolderId
          setDocuments((d) => [
            ...d,
            ...result.files.map(({ relativePath, file }) => {
              const parts = relativePath.split('/')
              const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : result.rootName!
              const fileFolderId = dirPath ? pathToTempId[dirPath] : pathToTempId[result.rootName!]
              return {
                ...INITIAL_DOC,
                id: crypto.randomUUID(),
                mode: 'file' as const,
                file,
                label: file.name || '',
                permitted: 'all' as PermittedSpecialists,
                folderId: fileFolderId ?? folderId,
              }
            }),
          ])
          setProcessingFolderDrop(false)
        } else {
          addFiles(result.files.map((x) => x.file))
        }
      })()
    },
    [addFiles, currentFolderId]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files?.length) addFiles(files)
      e.target.value = ''
    },
    [addFiles]
  )

  const toggleSpecialist = (current: PermittedSpecialists, id: string): PermittedSpecialists => {
    if (current === 'all') return [id]
    const set = new Set(current)
    if (set.has(id)) {
      set.delete(id)
      return set.size === 0 ? 'all' : [...set]
    }
    set.add(id)
    return [...set]
  }

  const addFolder = useCallback(() => {
    const name = newFolderName.trim()
    if (!name) return
    const parentId = currentFolderId === ROOT_ID ? null : currentFolderId
    setFolders((f) => [...f, { id: crypto.randomUUID(), name, parentId }])
    setNewFolderName('')
  }, [currentFolderId, newFolderName])

  const updateFolder = useCallback((id: string, patch: Partial<FolderEntry>) => {
    setFolders((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }, [])

  const removeFolder = useCallback((id: string) => {
    setFolders((f) => f.filter((x) => x.id !== id))
    setDocuments((d) => d.map((x) => (x.folderId === id ? { ...x, folderId: null } : x)))
    setCurrentFolderId((cur) => (cur === id ? ROOT_ID : cur))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Project name is required.')
      return
    }
    setSubmitting(true)
    try {
      const project = await createProject({ name: name.trim(), description: summary.trim() || null })
      const projectId = project.id
      const slug = project.slug ?? project.id

      const folderIdMap: Record<string, string> = {}
      const normalizedParent = (p: string | null) => (p === ROOT_ID || !p ? null : p)
      const withChildren = (parentId: string | null): FolderEntry[] => {
        const pid = normalizedParent(parentId)
        return folders.filter((f) => normalizedParent(f.parentId) === pid)
      }
      const createFoldersRec = async (parentId: string | null) => {
        const children = withChildren(parentId)
        for (const f of children) {
          const realParentId = normalizedParent(parentId) === null ? null : folderIdMap[parentId!]
          const created = await createFolder(projectId, f.name, realParentId ?? undefined)
          folderIdMap[f.id] = created.id
          await createFoldersRec(f.id)
        }
      }
      await createFoldersRec(ROOT_ID)

      for (const doc of documents) {
        const folderId = doc.folderId && folderIdMap[doc.folderId] ? folderIdMap[doc.folderId] : undefined
        if (doc.mode === 'paste' && doc.content.trim()) {
          await addDocumentText(projectId, doc.content.trim(), doc.label.trim() || undefined, doc.permitted)
        } else if (doc.mode === 'file' && doc.file) {
          await uploadDocument(projectId, doc.file, doc.label.trim() || undefined, doc.permitted, folderId)
        }
      }

      if (githubUrl.trim()) {
        await addGitHubContext(projectId, githubUrl.trim(), githubLabel.trim() || undefined, githubPermitted)
      }

      navigate(`/project/${slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-white/50 hover:text-white/70 mb-4 inline-block">← Projects</Link>
      <h1 className="text-2xl font-semibold text-white mb-2">Create project</h1>
      <p className="text-white/60 mb-8">Add a name, summary, and optional documents or codebase. Choose which specialists can see each context.</p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Project name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q1 Product Strategy"
            className="w-full rounded-lg px-4 py-2.5 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Summary / description</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief description of the project and what decisions you’ll explore..."
            rows={3}
            className="w-full rounded-lg px-4 py-2.5 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Documents &amp; folders</label>
          <p className="text-xs text-white/50 mb-3">Same Drive-style layout as project documents. Create folders, then add files or pasted text. Structure is recreated when the project is created.</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_FILES}
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => setCurrentFolderId(ROOT_ID)}
              className={`text-sm ${currentFolderId === ROOT_ID ? 'text-white font-medium' : 'text-white/60 hover:text-white'}`}
            >
              All files
            </button>
            {currentFolderId !== ROOT_ID && folders.find((f) => f.id === currentFolderId) && (
              <>
                <span className="text-white/40">/</span>
                <span className="text-sm text-white">{folders.find((f) => f.id === currentFolderId)?.name}</span>
              </>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFolder())}
                placeholder="New folder name"
                className="w-36 rounded-lg px-2.5 py-1.5 bg-surface-700 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <button type="button" onClick={addFolder} disabled={!newFolderName.trim()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm hover:bg-white/15 disabled:opacity-50">
                <ion-icon name="add-circle-outline" /> New folder
              </button>
            </div>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragOver(false)
            }}
            className={`rounded-xl border-2 border-dashed transition-colors p-4 mb-4 ${
              (dragOver || processingFolderDrop) ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-white/15 bg-surface-800/30'
            }`}
          >
            {(dragOver || processingFolderDrop) ? (
              <div className="flex flex-col items-center justify-center gap-2 text-emerald-400">
                <ion-icon name={processingFolderDrop ? 'folder-open' : 'cloud-upload-outline'} className="text-4xl" />
                <p className="text-sm font-medium">
                  {processingFolderDrop ? 'Copying folder structure…' : 'Drop files or folder'}
                </p>
                {!processingFolderDrop && (
                  <p className="text-xs text-white/50">Folder structure is preserved</p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/80 text-white text-sm font-medium hover:bg-emerald-500/80">
                  <ion-icon name="cloud-upload-outline" /> Choose files
                </button>
                <button type="button" onClick={addDocument} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 text-white/80 text-sm hover:bg-white/10">
                  <ion-icon name="document-text-outline" /> Add pasted text
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {folders
              .filter((f) => (currentFolderId === ROOT_ID ? !f.parentId || f.parentId === ROOT_ID : f.parentId === currentFolderId))
              .map((f) => (
                <CreateProjectFolderTile
                  key={f.id}
                  folder={f}
                  onOpen={() => setCurrentFolderId(f.id)}
                  onRename={(name) => updateFolder(f.id, { name })}
                  onRemove={() => removeFolder(f.id)}
                />
              ))}
            {documents
              .filter((d) => (currentFolderId === ROOT_ID ? !d.folderId : d.folderId === currentFolderId))
              .map((doc) => (
                <CreateProjectDocTile
                  key={doc.id}
                  doc={doc}
                  onUpdate={(patch) => updateDoc(doc.id, patch)}
                  onRemove={() => removeDocument(doc.id)}
                  onToggleSpecialist={(spec) => updateDoc(doc.id, { permitted: toggleSpecialist(doc.permitted, spec) })}
                  canRemove
                />
              ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Codebase (optional)</label>
          <p className="text-xs text-white/50 mb-2">Add a public GitHub repo URL to pull in a codebase summary. Choose which agents can see it.</p>
          <input
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full rounded-lg px-4 py-2.5 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-2"
          />
          <input
            type="text"
            value={githubLabel}
            onChange={(e) => setGithubLabel(e.target.value)}
            placeholder="Label (e.g. Main repo)"
            className="w-full rounded-lg px-4 py-2.5 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-3"
          />
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={githubPermitted === 'all'}
                onChange={() => setGithubPermitted('all')}
                className="rounded border-white/30"
              />
              <span className="text-sm text-white/70">All</span>
            </label>
            {mockSpecialists.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={githubPermitted !== 'all' && githubPermitted.includes(s.id)}
                  onChange={() => setGithubPermitted(toggleSpecialist(githubPermitted, s.id))}
                  className="rounded border-white/30"
                />
                <span className="text-sm" style={{ color: s.color }}>{s.name}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Creating…' : 'Create project'}
          </button>
          <Link to="/" className="px-6 py-3 rounded-lg bg-surface-700 text-white/80 hover:bg-surface-600 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

/** Square Drive-style folder tile for Create Project (local state only). */
function CreateProjectFolderTile({
  folder,
  onOpen,
  onRename,
  onRemove,
}: {
  folder: FolderEntry
  onOpen: () => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [title, setTitle] = useState(folder.name)
  const [editing, setEditing] = useState(false)
  const handleBlur = () => {
    setEditing(false)
    if (title.trim()) onRename(title.trim())
    else setTitle(folder.name)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800 overflow-hidden hover:border-white/20 transition-colors flex flex-col aspect-square w-full relative group">
      <button type="button" onClick={onOpen} className="flex-1 flex items-center justify-center min-h-0 p-5 w-full">
        <div className="w-20 h-20 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
          <ion-icon name="folder-outline" className="text-4xl" />
        </div>
      </button>
      <div className="p-3 border-t border-white/5 bg-surface-800/80 flex items-center gap-2">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), handleBlur())}
            className="flex-1 min-w-0 rounded px-2 py-1 text-base text-white bg-surface-700 border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoFocus
          />
        ) : (
          <p
            className="flex-1 min-w-0 text-white text-base truncate px-1 py-0.5 rounded group-hover:bg-white/5 font-medium"
            title={folder.name}
            onDoubleClick={(e) => {
              e.preventDefault()
              setEditing(true)
            }}
          >
            {title || folder.name}
          </p>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} className="shrink-0 p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10" title="Remove folder">
          <ion-icon name="trash-outline" className="text-xl" />
        </button>
      </div>
    </div>
  )
}

const docTypeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40'

/** Square Drive-style document tile: icon on top, renamable title at bottom, dropdown for agents. */
function CreateProjectDocTile({
  doc,
  onUpdate,
  onRemove,
  onToggleSpecialist,
  canRemove,
}: {
  doc: DocEntry
  onUpdate: (patch: Partial<DocEntry>) => void
  onRemove: () => void
  onToggleSpecialist: (id: string) => void
  canRemove: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const displayName = doc.mode === 'file' ? (doc.file?.name ?? doc.label ?? 'File') : (doc.label || 'Pasted text')
  const [title, setTitle] = useState(displayName)
  const [editing, setEditing] = useState(false)
  const handleBlur = () => {
    setEditing(false)
    if (title.trim()) onUpdate({ label: title.trim() })
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800 overflow-visible hover:border-white/20 transition-colors flex flex-col aspect-square w-full relative group">
      <div className="flex-1 flex items-center justify-center min-h-0 p-5">
        <div className={`w-20 h-20 rounded-xl flex items-center justify-center shrink-0 ${docTypeColor}`}>
          <ion-icon name={doc.mode === 'file' ? 'document-outline' : 'document-text-outline'} className="text-4xl" />
        </div>
      </div>
      <div className="p-3 border-t border-white/5 bg-surface-800/80 flex items-center gap-2">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), handleBlur())}
            className="flex-1 min-w-0 rounded px-2 py-1 text-base text-white bg-surface-700 border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoFocus
          />
        ) : (
          <p
            className="flex-1 min-w-0 text-white text-base truncate px-1 py-0.5 rounded group-hover:bg-white/5 font-medium"
            title={displayName}
            onDoubleClick={(e) => {
              e.preventDefault()
              setEditing(true)
            }}
          >
            {title || displayName}
          </p>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowDropdown((v) => !v) }}
          className="shrink-0 p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
          title="Who can access"
        >
          <ion-icon name={showDropdown ? 'people' : 'people-outline'} className="text-xl" />
        </button>
        {canRemove && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} className="shrink-0 p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10" title="Remove">
            <ion-icon name="trash-outline" className="text-xl" />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 p-4 rounded-xl border border-white/10 bg-surface-800 shadow-xl min-w-[220px]" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-medium text-white/80 mb-3">Who can use this</p>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5">
              <input type="checkbox" checked={doc.permitted === 'all'} onChange={() => onUpdate({ permitted: 'all' })} className="rounded border-white/30 w-4 h-4" />
              <span className="text-sm text-white/80">All</span>
            </label>
            {mockSpecialists.map((s) => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5" style={doc.permitted !== 'all' && doc.permitted.includes(s.id) ? { backgroundColor: `${s.color}20`, borderColor: s.color } : {}}>
                <input type="checkbox" checked={doc.permitted !== 'all' && doc.permitted.includes(s.id)} onChange={() => onToggleSpecialist(s.id)} className="rounded border-white/30 w-4 h-4" />
                <span className="text-sm" style={{ color: s.color }}>{s.name}</span>
              </label>
            ))}
          </div>
          {doc.mode === 'paste' && (
            <textarea
              value={doc.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Paste content..."
              rows={3}
              className="w-full mt-3 rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
            />
          )}
        </div>
      )}
    </div>
  )
}
