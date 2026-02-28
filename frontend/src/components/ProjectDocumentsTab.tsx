import { useState, useCallback, useEffect } from 'react'
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

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const docs = getProjectDocuments(projectId)
  const [personaByDoc, setPersonaByDoc] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {}
    docs.forEach((d) => {
      initial[d.id] = new Set(d.personaIds ?? [])
    })
    return initial
  })

  useEffect(() => {
    const next: Record<string, Set<string>> = {}
    docs.forEach((d) => {
      next[d.id] = new Set(d.personaIds ?? [])
    })
    setPersonaByDoc(next)
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

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/60 text-sm">
          Attach documents, Slack exports, and codebase context. Choose which specialists can use each one.
        </p>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/80 text-white text-sm font-medium hover:bg-emerald-500/80 border border-emerald-500/40 transition-colors"
        >
          <ion-icon name="add-circle" />
          Add attachment
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface-800/30 p-12 text-center">
          <ion-icon name="document-outline" className="text-5xl text-white/30 mb-4" />
          <p className="text-white/60 mb-4">No documents attached yet.</p>
          <p className="text-white/40 text-sm mb-6">
            Add documents, Slack pastes, or a GitHub repo URL so specialists can use them in the chat.
          </p>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/15 transition-colors mx-auto"
          >
            <ion-icon name="add" />
            Add first attachment
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
