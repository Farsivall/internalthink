import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createProject } from '../api/projects'
import { addDocumentText, uploadDocument, addGitHubContext } from '../api/context'
import type { PermittedSpecialists } from '../api/context'
import { mockSpecialists } from '../data/mock'

type DocEntry = {
  id: string
  mode: 'paste' | 'file'
  content: string
  file: File | null
  label: string
  permitted: PermittedSpecialists
}

const INITIAL_DOC: DocEntry = {
  id: crypto.randomUUID(),
  mode: 'paste',
  content: '',
  file: null,
  label: '',
  permitted: 'all',
}

export function CreateProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [documents, setDocuments] = useState<DocEntry[]>([{ ...INITIAL_DOC, id: crypto.randomUUID() }])
  const [githubUrl, setGithubUrl] = useState('')
  const [githubLabel, setGithubLabel] = useState('')
  const [githubPermitted, setGithubPermitted] = useState<PermittedSpecialists>('all')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addDocument = () => {
    setDocuments((d) => [...d, { ...INITIAL_DOC, id: crypto.randomUUID() }])
  }

  const removeDocument = (id: string) => {
    setDocuments((d) => d.filter((x) => x.id !== id))
  }

  const updateDoc = (id: string, patch: Partial<DocEntry>) => {
    setDocuments((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

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

      for (const doc of documents) {
        if (doc.mode === 'paste' && doc.content.trim()) {
          await addDocumentText(projectId, doc.content.trim(), doc.label.trim() || undefined, doc.permitted)
        } else if (doc.mode === 'file' && doc.file) {
          await uploadDocument(projectId, doc.file, doc.label.trim() || undefined, doc.permitted)
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
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white/80">Documents</label>
            <button type="button" onClick={addDocument} className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
              <ion-icon name="add-circle-outline" /> Add document
            </button>
          </div>
          <p className="text-xs text-white/50 mb-3">Paste text or upload a file. Choose which agents can read each document.</p>
          <div className="space-y-4">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-white/10 bg-surface-800 p-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDoc(doc.id, { mode: 'paste' })}
                    className={`px-3 py-1.5 rounded-lg text-sm ${doc.mode === 'paste' ? 'bg-emerald-600/80 text-white' : 'bg-surface-700 text-white/60'}`}
                  >
                    Paste text
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDoc(doc.id, { mode: 'file' })}
                    className={`px-3 py-1.5 rounded-lg text-sm ${doc.mode === 'file' ? 'bg-emerald-600/80 text-white' : 'bg-surface-700 text-white/60'}`}
                  >
                    Upload file
                  </button>
                  {documents.length > 1 && (
                    <button type="button" onClick={() => removeDocument(doc.id)} className="ml-auto text-white/40 hover:text-red-400 p-1" title="Remove">
                      <ion-icon name="trash-outline" />
                    </button>
                  )}
                </div>
                {doc.mode === 'paste' ? (
                  <textarea
                    value={doc.content}
                    onChange={(e) => updateDoc(doc.id, { content: e.target.value })}
                    placeholder="Paste document content..."
                    rows={4}
                    className="w-full rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
                  />
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.txt,text/plain,application/pdf"
                    onChange={(e) => updateDoc(doc.id, { file: e.target.files?.[0] ?? null })}
                    className="w-full text-sm text-white/80 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600/80 file:text-white"
                  />
                )}
                <input
                  type="text"
                  value={doc.label}
                  onChange={(e) => updateDoc(doc.id, { label: e.target.value })}
                  placeholder="Label (e.g. Pitch Deck)"
                  className="w-full rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <div>
                  <p className="text-xs text-white/50 mb-2">Agents who can see this document</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doc.permitted === 'all'}
                        onChange={() => updateDoc(doc.id, { permitted: 'all' })}
                        className="rounded border-white/30"
                      />
                      <span className="text-sm text-white/70">All</span>
                    </label>
                    {mockSpecialists.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doc.permitted !== 'all' && doc.permitted.includes(s.id)}
                          onChange={() => updateDoc(doc.id, { permitted: toggleSpecialist(doc.permitted, s.id) })}
                          className="rounded border-white/30"
                        />
                        <span className="text-sm" style={{ color: s.color }}>{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
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
