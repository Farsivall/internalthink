from pydantic import BaseModel
from app.schemas.chat import SpecialistResponse


class DecisionRequest(BaseModel):
    project_id: str
    question: str


class DecisionResponse(BaseModel):
    decision_id: str | None = None
    question: str
    responses: list[SpecialistResponse]
