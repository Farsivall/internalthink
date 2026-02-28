export type ProjectStatus = 'Active' | 'Completed' | 'Draft'
export type DecisionStatus = 'Draft' | 'Evaluated' | 'Reviewed'

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  decisionCount: number
  updatedAt: string
  createdAt: string
  /** Tailwind color class for folder icon only (e.g. text-emerald-400) */
  iconColor: string
}

export interface PersonaScore {
  personaId: string
  personaName: string
  color: string
  score: number
  summary?: string
}

export interface Decision {
  id: string
  projectId: string
  title: string
  status: DecisionStatus
  summary: string
  risks: string[]
  personaScores: PersonaScore[]
  docCount: number
  slideCount: number
  chatThreadCount: number
  updatedAt: string
  createdAt: string
  riskLevel?: 'low' | 'medium' | 'high'
}

export interface ChatMessage {
  id: string
  personaId: string
  score: number
  text: string
  objections?: string[]
  evidenceGaps?: string[]
  at: string
}

/** WhatsApp-style thread: sender is 'user' or a personaId; messages ordered by time */
export interface ThreadMessage {
  id: string
  sender: 'user' | string
  text: string
  at: string
  /** Only for persona messages */
  score?: number
  objections?: string[]
  evidenceGaps?: string[]
  /** AI thinking/reasoning process (shown when message is clicked) */
  thinkingProcess?: string
}

/** Specialist (persona) that can be added/removed from project chat */
export interface Specialist {
  id: string
  name: string
  color: string
}

/** Document attachment on a project; personaIds = which specialists can use this context */
export interface ProjectDocument {
  id: string
  projectId: string
  name: string
  type: 'document' | 'slack' | 'codebase'
  label?: string
  addedAt: string
  /** Specialist IDs that have access to this context (empty = none) */
  personaIds: string[]
}

const PERSONA_COLORS: Record<string, string> = {
  p1: '#8b5cf6',
  p2: '#ec4899',
  p3: '#14b8a6',
  p4: '#f97316',
  legal: '#6366f1',
  financial: '#22c55e',
  technical: '#0ea5e9',
  bd: '#f59e0b',
  tax: '#a855f7',
}

/** All available specialists (backend spec: Legal, Financial, Technical, BD, Tax) */
export const mockSpecialists: Specialist[] = [
  { id: 'legal', name: 'Legal', color: PERSONA_COLORS.legal },
  { id: 'financial', name: 'Financial', color: PERSONA_COLORS.financial },
  { id: 'technical', name: 'Technical', color: PERSONA_COLORS.technical },
  { id: 'bd', name: 'Business Development', color: PERSONA_COLORS.bd },
  { id: 'tax', name: 'Tax', color: PERSONA_COLORS.tax },
]

/** Project-level chat: one thread per project (key = projectId) */
export const mockProjectChats: Record<string, ThreadMessage[]> = {
  'proj-1': [
    { id: 'pc1', sender: 'user', text: 'Should we narrow focus to personal statements only?', at: '2025-02-27T09:00:00Z' },
    { id: 'pc2', sender: 'legal', text: 'That would require a ToS review and we’d need to manage user expectations for existing full-suite users. Risk: medium.', at: '2025-02-27T09:01:00Z',
      thinkingProcess:
        '1. Identified key legal implications: ToS changes, user consent, existing contracts.\n2. Cross-referenced with product brief and Slack context on user segments.\n3. Risk assessment: medium due to grandfathering complexity and notification requirements.\n4. Recommendation: proceed with clear migration path and 30-day notice.',
    },
    {
      id: 'pc3',
      sender: 'bd',
      text: 'Worth considering if we have a clear distribution partner for personal-statement-only. Who’s the counterparty?', at: '2025-02-27T09:01:30Z',
      thinkingProcess:
        '1. Evaluated market positioning for narrow vs full-suite product.\n2. Distribution partners typically prefer focused offerings for clearer GTM.\n3. Need to validate: who would co-sell or white-label personal-statement-only?\n4. Open question to user: counterparty identification is critical for BD assessment.',
    },
  ],
}

/** Mock AI happiness per specialist per project (0–10) */
export const mockSpecialistHappiness: Record<string, Record<string, number>> = {
  'proj-1': { legal: 7, financial: 8, technical: 6, bd: 5, tax: 8 },
  'proj-2': { legal: 6, financial: 9, technical: 7, bd: 8, tax: 7 },
  'proj-3': { legal: 5, financial: 5, technical: 5, bd: 5, tax: 5 },
}

/** Documents attached to each project */
export const mockProjectDocuments: ProjectDocument[] = [
  { id: 'doc1', projectId: 'proj-1', name: 'Product brief.pdf', type: 'document', label: 'Pitch Deck', addedAt: '2025-02-25T10:00:00Z', personaIds: ['legal', 'financial', 'technical', 'bd', 'tax'] },
  { id: 'doc2', projectId: 'proj-1', name: '#product (Slack export)', type: 'slack', label: '#product', addedAt: '2025-02-26T14:00:00Z', personaIds: ['legal', 'financial', 'technical', 'bd'] },
  { id: 'doc3', projectId: 'proj-1', name: 'Repo summary', type: 'codebase', label: 'GitHub', addedAt: '2025-02-27T09:00:00Z', personaIds: ['technical'] },
  { id: 'doc4', projectId: 'proj-2', name: 'Vendor comparison.xlsx', type: 'document', addedAt: '2025-02-24T11:00:00Z', personaIds: ['financial', 'bd'] },
]

export const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Q1 Product Strategy',
    description: 'Feature prioritization and launch timeline for core product.',
    status: 'Active',
    decisionCount: 4,
    updatedAt: '2025-02-27',
    createdAt: '2025-02-01',
    iconColor: 'text-emerald-400',
  },
  {
    id: 'proj-2',
    name: 'Vendor Selection',
    description: 'Evaluate and select infrastructure and tooling vendors.',
    status: 'Active',
    decisionCount: 2,
    updatedAt: '2025-02-26',
    createdAt: '2025-02-10',
    iconColor: 'text-violet-400',
  },
  {
    id: 'proj-3',
    name: 'Risk & Compliance',
    description: 'Regulatory and risk decisions for new markets.',
    status: 'Draft',
    decisionCount: 0,
    updatedAt: '2025-02-20',
    createdAt: '2025-02-20',
    iconColor: 'text-amber-400',
  },
]

export const mockDecisions: Decision[] = [
  {
    id: 'dec-1',
    projectId: 'proj-1',
    title: 'Launch date for Module X',
    status: 'Evaluated',
    summary: 'Whether to ship Module X in March or delay to April based on QA and persona feedback.',
    risks: ['Timeline pressure may affect quality', 'Dependency on external API'],
    personaScores: [
      { personaId: 'p1', personaName: 'Engineering', color: PERSONA_COLORS.p1, score: 7, summary: 'Feasible with focused scope' },
      { personaId: 'p2', personaName: 'Product', color: PERSONA_COLORS.p2, score: 8 },
      { personaId: 'p3', personaName: 'Risk', color: PERSONA_COLORS.p3, score: 5, summary: 'Concern about rollout risk' },
    ],
    docCount: 3,
    slideCount: 1,
    chatThreadCount: 3,
    updatedAt: '2025-02-27',
    createdAt: '2025-02-15',
    riskLevel: 'medium',
  },
  {
    id: 'dec-2',
    projectId: 'proj-1',
    title: 'Pricing tier structure',
    status: 'Reviewed',
    summary: 'Three-tier vs four-tier pricing and positioning for enterprise.',
    risks: ['Channel conflict', 'Grandfathering existing customers'],
    personaScores: [
      { personaId: 'p1', personaName: 'Engineering', color: PERSONA_COLORS.p1, score: 6 },
      { personaId: 'p2', personaName: 'Product', color: PERSONA_COLORS.p2, score: 9 },
      { personaId: 'p4', personaName: 'Sales', color: PERSONA_COLORS.p4, score: 7 },
    ],
    docCount: 5,
    slideCount: 2,
    chatThreadCount: 4,
    updatedAt: '2025-02-26',
    createdAt: '2025-02-10',
    riskLevel: 'high',
  },
]

export const mockChatMessages: Record<string, ChatMessage[]> = {
  'dec-1-p1': [
    { id: 'm1', personaId: 'p1', score: 7, text: 'Scope is clear; we can hit March if we cut the optional integrations.', objections: ['API latency unknowns'], at: '2025-02-27T10:00:00Z' },
  ],
  'dec-1-p2': [
    { id: 'm2', personaId: 'p2', score: 8, text: 'Strong support for March. Aligns with roadmap and customer commitments.', at: '2025-02-27T10:15:00Z' },
  ],
  'dec-1-p3': [
    { id: 'm3', personaId: 'p3', score: 5, text: 'Rollout risk is medium. Recommend phased regions.', objections: ['No rollback plan documented'], evidenceGaps: ['Load test results'], at: '2025-02-27T11:00:00Z' },
  ],
}

/** WhatsApp-style threads: user and persona messages in order (key = decisionId-personaId) */
export const mockThreads: Record<string, ThreadMessage[]> = {
  'dec-1-p1': [
    { id: 't1', sender: 'user', text: 'Can we realistically ship Module X in March with the current scope?', at: '2025-02-27T09:50:00Z' },
    { id: 't2', sender: 'p1', text: 'Scope is clear; we can hit March if we cut the optional integrations. My score: 7/10. Main concern: API latency unknowns for the new endpoint.', at: '2025-02-27T10:00:00Z', score: 7, objections: ['API latency unknowns'] },
    { id: 't3', sender: 'user', text: 'What if we delay the integrations to April?', at: '2025-02-27T10:05:00Z' },
    { id: 't4', sender: 'p1', text: 'That would de-risk the March launch. I’d move to 8/10. We’d need a clear cut list and comms to stakeholders.', at: '2025-02-27T10:08:00Z', score: 8 },
  ],
  'dec-1-p2': [
    { id: 't5', sender: 'user', text: 'How does March align with the roadmap?', at: '2025-02-27T10:10:00Z' },
    { id: 't6', sender: 'p2', text: 'Strong support for March. Aligns with roadmap and customer commitments. Score: 8/10.', at: '2025-02-27T10:15:00Z', score: 8 },
  ],
  'dec-1-p3': [
    { id: 't7', sender: 'user', text: 'What’s the rollout risk?', at: '2025-02-27T10:55:00Z' },
    { id: 't8', sender: 'p3', text: 'Rollout risk is medium. Recommend phased regions. Score: 5/10. Objections: No rollback plan documented. Evidence gaps: Load test results.', at: '2025-02-27T11:00:00Z', score: 5, objections: ['No rollback plan documented'], evidenceGaps: ['Load test results'] },
  ],
}

export function getProject(id: string): Project | undefined {
  return mockProjects.find((p) => p.id === id)
}

export function getDecisionsByProject(projectId: string): Decision[] {
  return mockDecisions.filter((d) => d.projectId === projectId)
}

export function getDecision(projectId: string, decisionId: string): Decision | undefined {
  return mockDecisions.find((d) => d.projectId === projectId && d.id === decisionId)
}

export function getChatMessages(decisionId: string, personaId: string): ChatMessage[] {
  return mockChatMessages[`${decisionId}-${personaId}`] ?? []
}

export function getThread(decisionId: string, personaId: string): ThreadMessage[] {
  return mockThreads[`${decisionId}-${personaId}`] ?? []
}

export function getProjectChat(projectId: string): ThreadMessage[] {
  return mockProjectChats[projectId] ?? []
}

export function getProjectDocuments(projectId: string): ProjectDocument[] {
  return mockProjectDocuments.filter((d) => d.projectId === projectId)
}
