from pydantic import BaseModel


class InlineDocument(BaseModel):
    """Ephemeral document content for a single evaluation (not saved to DB)."""
    content: str
    label: str | None = None


class DecisionEvaluateRequest(BaseModel):
    title: str
    description: str
    context: str | None = None  # optional extra context
    document_ids: list[str] | None = None  # optional: limit context to these context_sources ids (e.g. proposal docs)
    inline_documents: list[InlineDocument] | None = None  # optional: use-only-for-this-eval content (e.g. pasted or extracted from file)


class SpecialistScore(BaseModel):
    specialist_id: str
    specialist_name: str
    score: int  # 1-10
    summary: str
    objections: list[str] = []


class DimensionScoreDetail(BaseModel):
    """Per-dimension score from decision_persona_scores.dimensions JSON."""
    Name: str = ""
    Score: int = 0
    KeyRisks: list[str] = []
    TradeOffs: list[str] = []
    EvidenceGaps: list[str] = []


class DecisionPersonaScoreDetail(BaseModel):
    """One row from decision_persona_scores: matrix scoring + what would change my mind."""
    persona_name: str
    total_score: int  # 0-100
    dimensions: list[DimensionScoreDetail] = []
    what_would_change_my_mind: list[str] = []
    high_structural_risk: bool = False


class DecisionEvaluateResponse(BaseModel):
    decision_id: str | None = None
    decision_title: str
    scores: list[SpecialistScore]
    agreement: str
    tradeoffs: str
    persona_scores: list[DecisionPersonaScoreDetail] = []  # from decision_persona_scores table
