import { useState, useCallback, useEffect, useRef } from 'react'
import { getContextSources, uploadDocument } from '../api/context'
import type { ContextSource } from '../api/context'
import type { PermittedSpecialists } from '../api/context'
import { getProjectDocuments, mockSpecialists } from '../data/mock'
import type { ProjectDocument } from '../data/mock'

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
    name: c.label ?? c.type,
    type: c.type,
    label: c.label ?? undefined,
    addedAt: c.created_at,
    personaIds: ['legal', 'financial', 'technical', 'bd', 'tax'],
  }
}

const ACCEPT_FILES = '.pdf,.txt,text/plain,application/pdf'

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [personaByDoc, setPersonaByDoc] = useState<Record<string, Set<string>>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getContextSources(projectId)
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
        const fallback = getProjectDocuments(projectId)
        setDocs(fallback)
        const next: Record<string, Set<string>> = {}
        fallback.forEach((d) => {
          next[d.id] = new Set(d.personaIds ?? [])
        })
        setPersonaByDoc(next)
      })
      .finally(() => setLoading(false))
  }, [projectId])

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
    setLoading(true)
    getContextSources(projectId)
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
        const fallback = getProjectDocuments(projectId)
        setDocs(fallback)
        const next: Record<string, Set<string>> = {}
        fallback.forEach((d) => {
          next[d.id] = new Set(d.personaIds ?? [])
        })
        setPersonaByDoc(next)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      setUploadError(null)
      setUploading(true)
      const permitted: PermittedSpecialists = 'all'
      try {
        for (let i = 0; i < files.length; i++) {
          await uploadDocument(projectId, files[i], files[i].name || undefined, permitted)
        }
        refetch()
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        e.target.value = ''
      }
    },
    [projectId, refetch]
  )

  return (
    <div className="animate-fade-in">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_FILES}
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/60 text-sm">
          Attach documents, Slack exports, and codebase context. Choose which specialists can use each one.
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/80 text-white text-sm font-medium hover:bg-emerald-500/80 border border-emerald-500/40 transition-colors disabled:opacity-50"
        >
          <ion-icon name="add-circle" />
          {uploading ? 'Uploading…' : 'Attach files'}
        </button>
      </div>
      {uploadError && (
        <p className="text-amber-400/90 text-sm mb-4">{uploadError}</p>
      )}

      {loading ? (
        <div className="text-white/50 py-8">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/30 p-12 text-center">
          <ion-icon name="document-outline" className="text-5xl text-white/30 mb-4" />
          <p className="text-white/60 mb-4">No documents attached yet.</p>
          <p className="text-white/40 text-sm mb-6">
            Add documents, Slack pastes, or a GitHub repo URL so specialists can use them in the chat.
          </p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/15 transition-colors mx-auto disabled:opacity-50"
          >
            <ion-icon name="add" />
            {uploading ? 'Uploading…' : 'Attach files'}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              selectedPersonaIds={getPersonasForDoc(doc.id)}
              onTogglePersona={(personaId) => togglePersona(doc.id, personaId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentCard({
  doc,
  selectedPersonaIds,
  onTogglePersona,
}: {
  doc: ProjectDocument
  selectedPersonaIds: Set<string>
  onTogglePersona: (personaId: string) => void
}) {
  const [showPersonas, setShowPersonas] = useState(false)

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800 overflow-hidden hover:border-white/15 transition-colors flex flex-col">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${typeColors[doc.type] ?? typeColors.document}`}
          >
            <ion-icon name={typeIcons[doc.type] ?? 'document'} className="text-xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-medium truncate">{doc.name}</p>
            {doc.label && <p className="text-xs text-white/50">{doc.label}</p>}
            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded border text-xs font-medium ${typeColors[doc.type] ?? typeColors.document}`}>
              {typeLabels[doc.type] ?? doc.type}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
              title="Access"
              onClick={() => setShowPersonas((v) => !v)}
            >
              <ion-icon name={showPersonas ? 'people' : 'people-outline'} />
            </button>
            <button type="button" className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10" title="Remove">
              <ion-icon name="trash-outline" />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-white/40 mt-2">{new Date(doc.addedAt).toLocaleDateString()}</p>
      </div>

      {showPersonas && (
        <div className="px-4 pb-4 pt-0 border-t border-white/5">
          <p className="text-xs font-medium text-white/60 mb-2">Who can use this context</p>
          <div className="flex flex-wrap gap-2">
            {mockSpecialists.map((p) => {
              const selected = selectedPersonaIds.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onTogglePersona(p.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selected
                      ? 'border-white/30 text-white'
                      : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                  }`}
                  style={selected ? { backgroundColor: `${p.color}25`, borderColor: p.color } : {}}
                >
                  {selected ? <ion-icon name="checkmark-circle" style={{ color: p.color }} /> : <ion-icon name="ellipse-outline" className="opacity-50" />}
                  {p.name}
                </button>
              )
            })}
          </div>
          {selectedPersonaIds.size === 0 && (
            <p className="text-[11px] text-amber-400/80 mt-1">No specialists selected — none will see this context.</p>
          )}
        </div>
      )}

      {!showPersonas && selectedPersonaIds.size > 0 && (
        <div className="px-4 pb-3 pt-0">
          <p className="text-[11px] text-white/50">
            <span className="text-white/70">{selectedPersonaIds.size}</span> specialist{selectedPersonaIds.size !== 1 ? 's' : ''} have access
          </p>
        </div>
      )}
    </div>
  )
}
