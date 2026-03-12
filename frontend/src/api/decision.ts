const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface CitationItem {
  claim_or_section: string
  source_label: string
  snippet_or_quote: string
}

export interface SpecialistScore {
  specialist_id: string
  specialist_name: string
  score: number
  summary: string
  objections: string[]
  citations?: CitationItem[] | null
  sources_used?: string[] | null
}

export interface DimensionScoreDetail {
  Name: string
  Score: number
  KeyRisks: string[]
  TradeOffs: string[]
  EvidenceGaps: string[]
}

export interface DecisionPersonaScoreDetail {
  persona_name: string
  total_score: number
  dimensions: DimensionScoreDetail[]
  what_would_change_my_mind: string[]
  high_structural_risk: boolean
  citations?: CitationItem[] | null
}

/** Synthesis fields from decision_tree.md (stored in decision_synthesis JSONB) */
export interface DecisionSynthesis {
  decision_summary?: string | null
  core_tensions?: string[] | null
  paths?: Array<{
    id: string
    title: string
    description?: string
    assumptions?: string[]
    upside?: string[]
    downside?: string[]
    execution_difficulty?: string
    favored_by?: Array<{ persona: string; reason: string }>
    concerned_by?: Array<{ persona: string; reason: string }>
    next_steps_outline?: unknown[]
  }> | null
  path_ranking?: Array<{
    path_id: string
    rank: number
    rationale?: string
    confidence_level?: string
    key_condition?: string
  }> | null
  recommended_path?: {
    path_id?: string
    title?: string
    why_best?: string
    risks_remain?: string
    outperforms_alternatives?: string
  } | null
  recommended_path_next_steps?: Array<{
    title: string
    reason?: string
    owner_type?: string
    expected_outcome?: string
    timeline_estimate?: string
    specialist_support?: string
  }> | null
  decision_tree?: {
    root?: unknown
    nodes?: unknown[]
    edges?: unknown[]
  } | null
}

export interface DecisionEvaluateResponse {
  decision_id?: string | null
  decision_title: string
  scores: SpecialistScore[]
  agreement: string
  tradeoffs: string
  persona_scores?: DecisionPersonaScoreDetail[]
  /** Labels of documents/inline attachments used for this evaluation */
  attached_labels?: string[] | null
  /** From decision_synthesis JSONB */
  decision_summary?: string | null
  core_tensions?: string[] | null
  paths?: DecisionSynthesis['paths']
  path_ranking?: DecisionSynthesis['path_ranking']
  recommended_path?: DecisionSynthesis['recommended_path']
  recommended_path_next_steps?: DecisionSynthesis['recommended_path_next_steps']
  decision_tree?: DecisionSynthesis['decision_tree']
}

export interface StoredDecisionResponse extends DecisionEvaluateResponse {
  // decision_id is required when loading from storage
  decision_id: string
}

export interface InlineDocumentInput {
  content: string
  label?: string | null
}

export interface DecisionEvaluateInput {
  title: string
  description: string
  context?: string | null
  document_ids?: string[] | null
  inline_documents?: InlineDocumentInput[] | null
  parent_id?: string | null
  specialist_ids?: string[] | null
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
      document_ids: input.document_ids?.length ? input.document_ids : null,
      inline_documents: input.inline_documents?.length ? input.inline_documents : null,
      parent_id: input.parent_id ?? null,
      specialist_ids: input.specialist_ids?.length ? input.specialist_ids : null,
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
  parent_id?: string | null
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
