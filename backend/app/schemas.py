from pydantic import BaseModel


class ChatRequest(BaseModel):
    project_id: str
    message: str
    specialist_ids: list[str]


class SpecialistResponse(BaseModel):
    specialist_id: str
    text: str
    thinking_process: str


class ChatResponse(BaseModel):
    responses: list[SpecialistResponse]
