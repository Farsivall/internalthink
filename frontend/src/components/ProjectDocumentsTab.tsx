import { getProjectDocuments } from '../data/mock'

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

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const docs = getProjectDocuments(projectId)

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/60 text-sm">Attach documents, Slack exports, and codebase context for specialists to use.</p>
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
          <p className="text-white/40 text-sm mb-6">Add documents, Slack pastes, or a GitHub repo URL so specialists can use them in the chat.</p>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/15 transition-colors mx-auto"
          >
            <ion-icon name="add" />
            Add first attachment
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-800 border border-white/10 hover:border-white/15 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`px-2 py-0.5 rounded border text-xs font-medium shrink-0 ${typeColors[doc.type] ?? typeColors.document}`}>
                  {typeLabels[doc.type] ?? doc.type}
                </span>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{doc.name}</p>
                  {doc.label && <p className="text-xs text-white/50">{doc.label}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-white/40">{new Date(doc.addedAt).toLocaleDateString()}</span>
                <button type="button" className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10" title="Remove">
                <ion-icon name="trash-outline" />
              </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
