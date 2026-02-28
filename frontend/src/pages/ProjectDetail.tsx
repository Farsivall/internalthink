import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProject } from '../api/projects'
import { getProject as getMockProject } from '../data/mock'
import { ProjectChatTab } from '../components/ProjectChatTab'
import { ProjectDocumentsTab } from '../components/ProjectDocumentsTab'
import { ProjectDecisionHappinessTab } from '../components/ProjectDecisionHappinessTab'

type Tab = 'chat' | 'documents' | 'decisions'

interface ProjectInfo {
  id: string
  name: string
  description: string
}

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }
    getProject(projectId)
      .then((p) =>
        setProject({
          id: p.slug ?? p.id,
          name: p.name,
          description: p.description ?? '',
        })
      )
      .catch(() => {
        const mock = getMockProject(projectId)
        if (mock) setProject({ id: mock.id, name: mock.name, description: mock.description })
        else setProject(null)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return <div className="text-white/50 py-12">Loading project…</div>
  }
  if (!project) {
    return (
      <div className="text-center py-12 text-white/60">
        Project not found. <Link to="/" className="text-accent-blue hover:underline">Back to projects</Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <Link to="/" className="text-sm text-white/50 hover:text-white/70 mb-1 inline-block">← Projects</Link>
          <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 text-white/60">{project.description}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-white/10 text-sm">Active</span>
            <button type="button" className="text-sm text-white/50 hover:text-white">Edit project</button>
          </div>
        </div>
      </div>

      {/* Nav tabs: Chat | Documents | Decision happiness */}
      <nav className="flex border-b border-white/10 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'chat'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-white/60 border-transparent hover:text-white'
          }`}
        >
          <ion-icon name="chatbubbles" className="text-lg" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'documents'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-white/60 border-transparent hover:text-white'
          }`}
        >
          <ion-icon name="document-attach" className="text-lg" />
          Document attachments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('decisions')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'decisions'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-white/60 border-transparent hover:text-white'
          }`}
        >
          <ion-icon name="happy-outline" className="text-lg" />
          Decision happiness
        </button>
      </nav>

      {activeTab === 'chat' && project.id && (
        <ProjectChatTab
          projectId={project.id}
          projectName={project.name}
          projectDescription={project.description}
          onOpenDocuments={() => setActiveTab('documents')}
        />
      )}
      {activeTab === 'documents' && project.id && <ProjectDocumentsTab projectId={project.id} />}
      {activeTab === 'decisions' && project.id && <ProjectDecisionHappinessTab projectId={project.id} />}
    </div>
  )
}
