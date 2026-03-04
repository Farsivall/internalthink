const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface SpecialistScore {
  specialist_id: string
  specialist_name: string
  score: number
  summary: string
  objections: string[]
}

export interface DecisionEvaluateResponse {
  decision_id?: string | null
  decision_title: string
  scores: SpecialistScore[]
  agreement: string
  tradeoffs: string
}

export interface StoredDecisionResponse extends DecisionEvaluateResponse {
  // decision_id is required when loading from storage
  decision_id: string
}

export interface DecisionEvaluateInput {
  title: string
  description: string
  context?: string | null
}

export async function evaluateDecision(
  projectId: string,
  input: DecisionEvaluateInput
): Promise<DecisionEvaluateResponse> {
  const url = API_BASE
    ? `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/decision/evaluate`
    : `/api/projects/${encodeURIComponent(projectId)}/decision/evaluate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      context: input.context ?? null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `Failed to evaluate decision: ${res.statusText}`)
  }
  return res.json()
}

export async function getDecision(decisionId: string): Promise<StoredDecisionResponse> {
  const url = API_BASE
    ? `${API_BASE}/api/projects/decisions/${encodeURIComponent(decisionId)}`
    : `/api/projects/decisions/${encodeURIComponent(decisionId)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load decision ${decisionId}: ${res.statusText}`)
  }
  return res.json()
}

export interface ProjectDecisionSummary {
  id: string
  project_id: string
  title: string
  summary: string
  status: string
  agreement: string
  tradeoffs: string
  created_at?: string | null
  updated_at?: string | null
}

export async function getProjectDecisions(projectId: string): Promise<ProjectDecisionSummary[]> {
  const url = API_BASE
    ? `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/decisions`
    : `/api/projects/${encodeURIComponent(projectId)}/decisions`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load decisions for project ${projectId}: ${res.statusText}`)
  }
  return res.json()
}
