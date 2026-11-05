import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.modules.tags.schemas import TagRead
from app.modules.technologies.models import TechnologyCategory


class TechnologyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: TechnologyCategory
    aliases: list[str]
    description: str
    website: str | None
    archived_at: datetime | None
    tags: list[TagRead] = []


class TechnologyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: TechnologyCategory = TechnologyCategory.OTHER
    aliases: list[str] = Field(default_factory=list, max_length=20)
    description: str = Field(default="", max_length=20_000)
    website: HttpUrl | None = None
    tag_ids: list[uuid.UUID] = []


class TechnologyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: TechnologyCategory | None = None
    aliases: list[str] | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=20_000)
    website: HttpUrl | None = None
    tag_ids: list[uuid.UUID] | None = None
