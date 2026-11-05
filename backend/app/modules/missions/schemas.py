import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.directory.schemas import Summary
from app.modules.missions.models import MissionStatus
from app.modules.technologies.models import TechnologyCategory

# Accessible Mantine palette used for agenda colours (P3-8); auto-picked when omitted.
MissionColor = Literal[
    "blue", "teal", "grape", "orange", "cyan", "pink",
    "lime", "violet", "indigo", "green", "red", "yellow",
]  # fmt: skip
MISSION_COLORS: tuple[str, ...] = MissionColor.__args__  # type: ignore[attr-defined]

Text200 = Field(min_length=1, max_length=200)
Markdown = Field(default="", max_length=100_000)


class MissionSummary(BaseModel):
    id: uuid.UUID
    title: str
    job_title: str
    client: Summary
    employer: Summary
    start_date: date
    planned_end_date: date | None
    actual_end_date: date | None
    status: MissionStatus
    # Status the dates point to when it differs from the stored one (RG / P3-4).
    suggested_status: MissionStatus | None
    color: str
    archived_at: datetime | None


class MissionContactRead(BaseModel):
    contact: Summary
    job_title: str | None
    company: Summary | None
    role: "RoleRead | None"
    note: str | None


class MissionTechnologyRead(BaseModel):
    technology: Summary
    category: TechnologyCategory
    weight: int
    version: str | None
    note: str | None


class EndDateChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    old_date: date | None
    new_date: date | None
    changed_at: datetime
    note: str | None


class MissionDetail(MissionSummary):
    location: str | None
    remote_policy: str | None
    objectives: str
    description: str
    review: str
    daily_rate: Decimal | None
    contacts: list[MissionContactRead]
    technologies: list[MissionTechnologyRead]
    end_date_changes: list[EndDateChangeRead]
    created_at: datetime


class MissionCreate(BaseModel):
    title: str = Text200
    job_title: str = Text200
    client_id: uuid.UUID
    # Defaults to the user's employer company (ADR-0017).
    employer_company_id: uuid.UUID | None = None
    start_date: date
    planned_end_date: date | None = None
    actual_end_date: date | None = None
    status: MissionStatus = MissionStatus.ACTIVE
    location: str | None = Field(default=None, max_length=200)
    remote_policy: str | None = Field(default=None, max_length=200)
    objectives: str = Markdown
    description: str = Markdown
    review: str = Markdown
    color: MissionColor | None = None
    daily_rate: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class MissionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    job_title: str | None = Field(default=None, min_length=1, max_length=200)
    client_id: uuid.UUID | None = None
    employer_company_id: uuid.UUID | None = None
    start_date: date | None = None
    planned_end_date: date | None = None
    actual_end_date: date | None = None
    # Optional explanation stored with a planned end date change (renewal, amendment).
    end_date_change_note: str | None = Field(default=None, max_length=500)
    status: MissionStatus | None = None
    location: str | None = Field(default=None, max_length=200)
    remote_policy: str | None = Field(default=None, max_length=200)
    objectives: str | None = Field(default=None, max_length=100_000)
    description: str | None = Field(default=None, max_length=100_000)
    review: str | None = Field(default=None, max_length=100_000)
    color: MissionColor | None = None
    daily_rate: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class MissionContactUpsert(BaseModel):
    role_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=500)


class MissionTechnologyUpsert(BaseModel):
    weight: int = Field(ge=1, le=5)
    version: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=500)


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_fr: str
    name_en: str


class RoleWithUsage(RoleRead):
    usage: int


class RoleCreate(BaseModel):
    name_fr: str = Field(min_length=1, max_length=80)
    name_en: str = Field(min_length=1, max_length=80)


class RoleUpdate(BaseModel):
    name_fr: str | None = Field(default=None, min_length=1, max_length=80)
    name_en: str | None = Field(default=None, min_length=1, max_length=80)


MissionContactRead.model_rebuild()
