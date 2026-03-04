from pydantic import BaseModel


class ChatRequest(BaseModel):
    project_id: str
    message: str
    specialist_ids: list[str]
    # Optional: when provided, chat behaves as a "decision call" and
    # specialists should answer only based on that decision + main docs.
    decision_id: str | None = None


class SpecialistResponse(BaseModel):
    specialist_id: str
    text: str
    thinking_process: str


class ChatResponse(BaseModel):
    responses: list[SpecialistResponse]
