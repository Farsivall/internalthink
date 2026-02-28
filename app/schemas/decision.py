from pydantic import BaseModel


class DecisionEvaluateRequest(BaseModel):
    title: str
    description: str
    context: str | None = None  # optional extra context


class SpecialistScore(BaseModel):
    specialist_id: str
    specialist_name: str
    score: int  # 1-10
    summary: str
    objections: list[str] = []


class DecisionEvaluateResponse(BaseModel):
    decision_title: str
    scores: list[SpecialistScore]
    agreement: str
    tradeoffs: str
