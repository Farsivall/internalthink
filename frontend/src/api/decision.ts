const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface SpecialistScore {
  specialist_id: string
  specialist_name: string
  score: number
  summary: string
  objections: string[]
}

export interface DecisionEvaluateResponse {
  decision_title: string
  scores: SpecialistScore[]
  agreement: string
  tradeoffs: string
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
