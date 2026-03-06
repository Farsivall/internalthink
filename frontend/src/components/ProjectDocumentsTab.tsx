import { useState, useCallback, useEffect, useRef } from 'react'
import {
  getFiles,
  getFolders,
  createFolder,
  renameFolder,
  renameDocument,
  uploadDocument,
  type ContextSource,
  type FolderItem,
  type PermittedSpecialists,
} from '../api/context'
import { getProjectDocuments, mockSpecialists } from '../data/mock'
import type { ProjectDocument } from '../data/mock'
import { getDroppedFilesAndFolders, getOrderedFolderPaths } from '../utils/folderDrop'

const typeLabels: Record<string, string> = {
  document: 'Document',
  slack: 'Slack',
  codebase: 'Codebase',
}

const typeColors: Record<string, string> = {
  document: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  slack: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  codebase: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
}

const typeIcons: Record<string, string> = {
  document: 'document-text',
  slack: 'chatbubbles',
  codebase: 'code-slash',
}

function toProjectDocument(c: ContextSource): ProjectDocument {
  return {
    id: c.id,
    projectId: c.project_id,
    name: c.label ?? c.file_name ?? c.type,
    type: c.type,
    label: c.label ?? undefined,
    addedAt: c.created_at,
    personaIds: ['legal', 'financial', 'technical', 'bd', 'tax'],
  }
}

const ACCEPT_FILES = '.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation'

const ROOT_ID = '__root__'

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const [rootFolders, setRootFolders] = useState<FolderItem[]>([])
  const [subfolders, setSubfolders] = useState<FolderItem[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(ROOT_ID)
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null)
  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [personaByDoc, setPersonaByDoc] = useState<Record<string, Set<string>>>({})
  const [dragOver, setDragOver] = useState(false)
  const [processingFolderDrop, setProcessingFolderDrop] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRootFolders = useCallback(() => {
    getFolders(projectId, null)
      .then(setRootFolders)
      .catch(() => setRootFolders([]))
  }, [projectId])

  const loadSubfolders = useCallback(() => {
    if (!currentFolderId || currentFolderId === ROOT_ID) {
      setSubfolders([])
      return
    }
    getFolders(projectId, currentFolderId)
      .then(setSubfolders)
      .catch(() => setSubfolders([]))
  }, [projectId, currentFolderId])

  const loadFiles = useCallback(() => {
    const folderId = currentFolderId === ROOT_ID ? undefined : currentFolderId ?? undefined
    setLoading(true)
    getFiles(projectId, folderId)
      .then((data) => {
        const mapped = data.map(toProjectDocument)
        setDocs(mapped)
        const next: Record<string, Set<string>> = {}
        mapped.forEach((d) => {
          next[d.id] = new Set(d.personaIds ?? [])
        })
        setPersonaByDoc(next)
      })
      .catch(() => {
        getProjectDocuments(projectId).then((fallback) => {
          setDocs(fallback)
          const next: Record<string, Set<string>> = {}
          fallback.forEach((d) => {
            next[d.id] = new Set(d.personaIds ?? [])
          })
          setPersonaByDoc(next)
        })
      })
      .finally(() => setLoading(false))
  }, [projectId, currentFolderId])

  useEffect(() => {
    loadRootFolders()
  }, [loadRootFolders])

  useEffect(() => {
    loadSubfolders()
    loadFiles()
  }, [loadSubfolders, loadFiles])

  const togglePersona = useCallback((docId: string, personaId: string) => {
    setPersonaByDoc((prev) => {
      const next = { ...prev }
      const set = new Set(next[docId] ?? [])
      if (set.has(personaId)) set.delete(personaId)
      else set.add(personaId)
      next[docId] = set
      return next
    })
  }, [])

  const getPersonasForDoc = (docId: string) => personaByDoc[docId] ?? new Set<string>()

  const refetch = useCallback(() => {
    loadRootFolders()
    loadSubfolders()
    loadFiles()
  }, [loadRootFolders, loadSubfolders, loadFiles])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      setUploadError(null)
      setUploading(true)
      const permitted: PermittedSpecialists = 'all'
      const folderId = currentFolderId === ROOT_ID ? undefined : currentFolderId ?? undefined
      try {
        for (let i = 0; i < files.length; i++) {
          await uploadDocument(projectId, files[i], files[i].name || undefined, permitted, folderId)
        }
        refetch()
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        e.target.value = ''
      }
    },
    [projectId, currentFolderId, refetch]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      setUploadError(null)
      setUploading(true)
      const permitted: PermittedSpecialists = 'all'
      const baseFolderId = currentFolderId === ROOT_ID ? undefined : currentFolderId ?? undefined

      ;(async () => {
        try {
          const result = await getDroppedFilesAndFolders(e.dataTransfer)
          if (result.files.length === 0) {
            setUploadError('No accepted files (PDF, TXT, MD, DOCX, PPTX)')
            return
          }

          if (result.isFolderDrop && result.rootName && result.files.length > 0) {
            setProcessingFolderDrop(true)
            const pathToId: Record<string, string> = {}
            const rootId = baseFolderId

            const created = await createFolder(projectId, result.rootName, rootId ?? undefined)
            pathToId[result.rootName] = created.id

            const orderedPaths = getOrderedFolderPaths(
              result.files.map((f) => f.relativePath),
              result.rootName
            )
            for (const folderPath of orderedPaths) {
              const parts = folderPath.split('/')
              const name = parts[parts.length - 1]
              const parentPath = parts.slice(0, -1).join('/')
              const parentId = parentPath ? pathToId[parentPath] : pathToId[result.rootName]
              const child = await createFolder(projectId, name, parentId)
              pathToId[folderPath] = child.id
            }

            for (const { relativePath, file } of result.files) {
              const parts = relativePath.split('/')
              const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : result.rootName
              const folderId = folderPath ? pathToId[folderPath] : pathToId[result.rootName]
              await uploadDocument(projectId, file, file.name || undefined, permitted, folderId)
            }
            setProcessingFolderDrop(false)
          } else {
            for (const { file } of result.files) {
              await uploadDocument(projectId, file, file.name || undefined, permitted, baseFolderId)
            }
          }
          refetch()
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed')
          setProcessingFolderDrop(false)
        } finally {
          setUploading(false)
        }
      })()
    },
    [projectId, currentFolderId, refetch]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    setUploadError(null)
    try {
      const parentId = currentFolderId === ROOT_ID ? null : currentFolderId
      await createFolder(projectId, name, parentId)
      setNewFolderName('')
      refetch()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }, [projectId, currentFolderId, newFolderName, refetch])

  const isRoot = currentFolderId === ROOT_ID || !currentFolderId
  const breadcrumbLabel = isRoot ? 'All files' : (currentFolder?.name ?? 'Folder')

  return (
    <div className="animate-fade-in flex flex-col h-full min-h-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_FILES}
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Sidebar: folders */}
        <aside className="w-52 shrink-0 flex flex-col rounded-xl border border-white/10 bg-surface-800/50 overflow-hidden">
          <div className="p-3 border-b border-white/10">
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Folders</p>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                setCurrentFolderId(ROOT_ID)
                setCurrentFolder(null)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                currentFolderId === ROOT_ID ? 'bg-emerald-600/30 text-white' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <ion-icon name="folder-open-outline" className="text-lg shrink-0" />
              <span className="truncate">All files</span>
            </button>
            {rootFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setCurrentFolderId(f.id)
                  setCurrentFolder(f)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  currentFolderId === f.id ? 'bg-emerald-600/30 text-white' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <ion-icon name="folder-outline" className="text-lg shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </nav>
          <div className="p-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/80 text-white text-sm font-medium hover:bg-emerald-500/80 disabled:opacity-50"
            >
              <ion-icon name="cloud-upload-outline" />
              {uploading ? 'Uploading…' : 'Upload files'}
            </button>
          </div>
        </aside>

        {/* Main: breadcrumb, drop zone, subfolders, grid */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm text-white/70 min-w-0">
              <ion-icon name="document-text-outline" className="shrink-0" />
              <button
                type="button"
                onClick={() => {
                  setCurrentFolderId(ROOT_ID)
                  setCurrentFolder(null)
                }}
                className={isRoot ? 'font-medium text-white' : 'hover:text-white truncate'}
              >
                All files
              </button>
              {!isRoot && (
                <>
                  <span className="text-white/40">/</span>
                  <span className="truncate text-white">{breadcrumbLabel}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="New folder name"
                  className="w-40 rounded-lg px-2.5 py-1.5 bg-surface-700 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm hover:bg-white/15 disabled:opacity-50"
                >
                  <ion-icon name="add-circle-outline" />
                  New folder
                </button>
              </div>
            </div>
          </div>

          {uploadError && (
            <p className="text-amber-400/90 text-sm mb-3">{uploadError}</p>
          )}

          {/* Drag-and-drop zone + content */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex-1 rounded-xl border-2 border-dashed transition-colors min-h-[200px] ${
              dragOver ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-white/15 bg-surface-800/30'
            }`}
          >
            {(dragOver || processingFolderDrop) && (
              <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-emerald-400">
                {processingFolderDrop ? (
                  <>
                    <ion-icon name="folder-open" className="text-6xl mb-2" />
                    <p className="text-sm font-medium">Copying folder structure…</p>
                    <p className="text-xs text-white/50 mt-1">Creating folders and uploading files</p>
                  </>
                ) : (
                  <>
                    <ion-icon name="cloud-upload" className="text-5xl mb-2" />
                    <p className="text-sm font-medium">Drop files or folder</p>
                    <p className="text-xs text-white/50 mt-1">PDF, TXT, MD, DOCX, PPTX — folder structure is preserved</p>
                  </>
                )}
              </div>
            )}
            {!dragOver && !processingFolderDrop && (
              <>
                {/* Subfolders row (when inside a folder) */}
                {subfolders.length > 0 && (
                  <div className="p-4 pb-0">
                    <p className="text-xs font-medium text-white/50 mb-2">Subfolders</p>
                    <div className="flex flex-wrap gap-2">
                      {subfolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setCurrentFolderId(f.id)
                            setCurrentFolder(f)
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 border border-white/10 text-white/90 hover:bg-surface-600 hover:border-white/20 text-sm"
                        >
                          <ion-icon name="folder-outline" />
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="p-8 text-white/50 text-sm">Loading…</div>
                ) : docs.length === 0 && subfolders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <ion-icon name="document-outline" className="text-5xl text-white/30 mb-4" />
                    <p className="text-white/60 mb-1">No documents here</p>
                    <p className="text-white/40 text-sm mb-4">
                      Drag and drop files or use Upload files in the sidebar. Add folders to organize.
                    </p>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/15 disabled:opacity-50"
                    >
                      <ion-icon name="add" />
                      {uploading ? 'Uploading…' : 'Choose files'}
                    </button>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                      {subfolders.map((f) => (
                        <FolderTile
                          key={f.id}
                          folder={f}
                          onOpen={() => {
                            setCurrentFolderId(f.id)
                            setCurrentFolder(f)
                          }}
                          onRename={(name) => {
                            renameFolder(f.id, name).then(() => refetch()).catch(() => {})
                          }}
                        />
                      ))}
                      {docs.map((doc) => (
                        <DocumentTile
                          key={doc.id}
                          doc={doc}
                          selectedPersonaIds={getPersonasForDoc(doc.id)}
                          onTogglePersona={(personaId) => togglePersona(doc.id, personaId)}
                          onRename={(title) => {
                            renameDocument(doc.id, title).then(() => refetch()).catch(() => {})
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/** Square Drive-style folder tile: icon on top, renamable title at bottom. */
function FolderTile({
  folder,
  onOpen,
  onRename,
}: {
  folder: FolderItem
  onOpen: () => void
  onRename: (name: string) => void
}) {
  const [title, setTitle] = useState(folder.name)
  const [editing, setEditing] = useState(false)
  const handleBlur = () => {
    setEditing(false)
    if (title.trim() && title !== folder.name) onRename(title.trim())
    else setTitle(folder.name)
  }

  return (
    <button
      type="button"
      onClick={() => !editing && onOpen()}
      className="rounded-xl border border-white/10 bg-surface-800 overflow-hidden hover:border-white/20 transition-colors flex flex-col aspect-square w-full text-left group"
    >
      <div className="flex-1 flex items-center justify-center min-h-0 p-5">
        <div className="w-20 h-20 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
          <ion-icon name="folder-outline" className="text-4xl" />
        </div>
      </div>
      <div className="p-3 border-t border-white/5 bg-surface-800/80">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), handleBlur())}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded px-2 py-1 text-base text-white bg-surface-700 border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoFocus
          />
        ) : (
          <p
            className="text-white text-base truncate px-1 py-0.5 rounded group-hover:bg-white/5 font-medium"
            title={folder.name}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {title || folder.name}
          </p>
        )}
      </div>
    </button>
  )
}

/** Square Drive-style document tile: icon on top, renamable title at bottom, dropdown for agent access. */
function DocumentTile({
  doc,
  selectedPersonaIds,
  onTogglePersona,
  onRename,
}: {
  doc: ProjectDocument
  selectedPersonaIds: Set<string>
  onTogglePersona: (personaId: string) => void
  onRename: (title: string) => void
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [title, setTitle] = useState(doc.name)
  const [editing, setEditing] = useState(false)
  const handleBlur = () => {
    setEditing(false)
    if (title.trim() && title !== doc.name) onRename(title.trim())
    else setTitle(doc.name)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800 overflow-visible hover:border-white/20 transition-colors flex flex-col aspect-square w-full relative group">
      <div className="flex-1 flex items-center justify-center min-h-0 p-5">
        <div className={`w-20 h-20 rounded-xl flex items-center justify-center ${typeColors[doc.type] ?? typeColors.document}`}>
          <ion-icon name={typeIcons[doc.type] ?? 'document'} className="text-4xl" />
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
            title={doc.name}
            onDoubleClick={(e) => {
              e.preventDefault()
              setEditing(true)
            }}
          >
            {title || doc.name}
          </p>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowDropdown((v) => !v)
          }}
          className="shrink-0 p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
          title="Who can access"
        >
          <ion-icon name={showDropdown ? 'people' : 'people-outline'} className="text-xl" />
        </button>
      </div>
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 p-4 rounded-xl border border-white/10 bg-surface-800 shadow-xl min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium text-white/80 mb-3">Who can use this</p>
          <div className="flex flex-wrap gap-2">
            {mockSpecialists.map((p) => {
              const selected = selectedPersonaIds.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onTogglePersona(p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selected ? 'border-white/30 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                  }`}
                  style={selected ? { backgroundColor: `${p.color}25`, borderColor: p.color } : {}}
                >
                  {selected ? <ion-icon name="checkmark-circle" style={{ color: p.color }} className="text-base" /> : null}
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
