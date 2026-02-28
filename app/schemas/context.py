from pydantic import BaseModel, ConfigDict
from datetime import datetime
from uuid import UUID
from typing import Literal, Optional, Union

# The type constraint mapping to the database CHECK constraint
ContextSourceType = Literal['document', 'codebase']

# Permitted specialists type: either "all" or a list of specialist identifiers
PermittedSpecialists = Union[Literal["all"], list[str]]

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

    model_config = ConfigDict(from_attributes=True)
