from pydantic import BaseModel, ConfigDict
from datetime import datetime
from uuid import UUID
from typing import Literal, Optional

# The type constraint mapping to the database CHECK constraint
ContextSourceType = Literal['document', 'slack', 'codebase']

class ContextSourceCreate(BaseModel):
    project_id: UUID
    type: ContextSourceType
    content: str
    label: Optional[str] = None

class GitHubContextRequest(BaseModel):
    project_id: UUID
    repo_url: str
    label: Optional[str] = None

class ContextSourceResponse(BaseModel):
    id: UUID
    project_id: UUID
    type: ContextSourceType
    label: Optional[str] = None
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
