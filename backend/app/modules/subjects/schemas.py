import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.modules.subjects.models import SubjectScope, SubjectStatus

Title = Field(min_length=1, max_length=200)
Markdown = Field(default="", max_length=100_000)


class SubjectRead(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    scope: SubjectScope
    mission_id: uuid.UUID | None
    category_id: uuid.UUID | None
    title: str
    status: SubjectStatus
    external_url: str | None
    description: str
    archived_at: datetime | None
    # Tasks directly on this subject, and minutes of those marked DONE.
    task_count: int
    done_minutes: int


class SubjectCreate(BaseModel):
    title: str = Title
    # RG-07: a child repeats its parent's scope and mission.
    scope: SubjectScope
    mission_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    status: SubjectStatus = SubjectStatus.OPEN
    external_url: HttpUrl | None = None
    description: str = Markdown


class SubjectUpdate(BaseModel):
    """Omitted fields are unchanged; `parent_id: null` moves the subject to the root."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    scope: SubjectScope | None = None
    mission_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    status: SubjectStatus | None = None
    external_url: HttpUrl | None = None
    description: str | None = Field(default=None, max_length=100_000)


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_fr: str
    name_en: str


class CategoryWithUsage(CategoryRead):
    usage: int


class CategoryCreate(BaseModel):
    name_fr: str = Field(min_length=1, max_length=80)
    name_en: str = Field(min_length=1, max_length=80)


class CategoryUpdate(BaseModel):
    name_fr: str | None = Field(default=None, min_length=1, max_length=80)
    name_en: str | None = Field(default=None, min_length=1, max_length=80)
