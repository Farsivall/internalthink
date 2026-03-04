from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from uuid import UUID
from typing import Literal, Optional, Union, Any

# The type constraint mapping to the database CHECK constraint
ContextSourceType = Literal['document', 'codebase']

# Permitted specialists type: either "all" or a list of specialist identifiers
PermittedSpecialists = Union[Literal["all"], list[str]]


def _normalize_permitted_specialists(v: Any) -> PermittedSpecialists:
    """Accept 'all', list, None, or the double-encoded string '"all"' from DB."""
    if v is None:
        return "all"
    if v == "all" or (isinstance(v, list) and all(isinstance(x, str) for x in v)):
        return v
    if isinstance(v, str) and v.strip('"') == "all":
        return "all"
    return v if isinstance(v, list) else "all"

class ContextSourceCreate(BaseModel):
    project_id: UUID
    type: ContextSourceType
    content: str
    label: Optional[str] = None
    permitted_specialists: PermittedSpecialists = "all"

class DocumentTextRequest(BaseModel):
    project_id: UUID
    content: str
    label: Optional[str] = None
    permitted_specialists: PermittedSpecialists = "all"

class GitHubContextRequest(BaseModel):
    project_id: UUID
    repo_url: str
    label: Optional[str] = None
    permitted_specialists: PermittedSpecialists = "all"

class ContextSourceResponse(BaseModel):
    id: UUID
    project_id: UUID
    type: ContextSourceType
    label: Optional[str] = None
    content: str
    permitted_specialists: Optional[PermittedSpecialists] = "all"
    created_at: datetime

    @field_validator("permitted_specialists", mode="before")
    @classmethod
    def normalize_permitted_specialists(cls, v: Any) -> PermittedSpecialists:
        return _normalize_permitted_specialists(v)

    model_config = ConfigDict(from_attributes=True)
