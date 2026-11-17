import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.directory.schemas import Summary


class ProjectSummary(BaseModel):
    id: uuid.UUID
    mission: Summary
    client: Summary
    name: str
    description: str
    archived_at: datetime | None
    document_count: int
    architecture_count: int


class ProjectCreate(BaseModel):
    mission_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=100_000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=100_000)
