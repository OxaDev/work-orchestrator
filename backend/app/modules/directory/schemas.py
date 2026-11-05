import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

from app.modules.directory.models import CompanyType
from app.modules.tags.schemas import TagRead

Name = Field(min_length=1, max_length=200)
OptionalName = Field(default=None, min_length=1, max_length=200)
Notes = Field(default="", max_length=50_000)


class Summary(BaseModel):
    """Lightweight reference to another entity, for display."""

    id: uuid.UUID
    name: str


# --- sectors --------------------------------------------------------------------------------


class SectorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_id: uuid.UUID | None
    name_fr: str
    name_en: str
    company_count: int = 0


class SectorCreate(BaseModel):
    name_fr: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    parent_id: uuid.UUID | None = None


class SectorUpdate(BaseModel):
    name_fr: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: uuid.UUID | None = None  # explicit null moves the sector to the root


# --- companies ------------------------------------------------------------------------------


class CompanyRead(BaseModel):
    id: uuid.UUID
    name: str
    types: list[CompanyType]
    primary_sector_id: uuid.UUID | None
    secondary_sector_ids: list[uuid.UUID]
    parent_company: Summary | None
    website: str | None
    notes: str
    tags: list[TagRead]
    contact_count: int
    archived_at: datetime | None
    created_at: datetime


class CompanyCreate(BaseModel):
    name: str = Name
    types: list[CompanyType] = Field(default_factory=lambda: [CompanyType.CLIENT])
    primary_sector_id: uuid.UUID | None = None
    secondary_sector_ids: list[uuid.UUID] = []
    parent_company_id: uuid.UUID | None = None
    website: HttpUrl | None = None
    notes: str = Notes
    tag_ids: list[uuid.UUID] = []


class CompanyUpdate(BaseModel):
    name: str | None = OptionalName
    types: list[CompanyType] | None = None
    primary_sector_id: uuid.UUID | None = None
    secondary_sector_ids: list[uuid.UUID] | None = None
    parent_company_id: uuid.UUID | None = None
    website: HttpUrl | None = None
    notes: str | None = Field(default=None, max_length=50_000)
    tag_ids: list[uuid.UUID] | None = None


# --- organisation ---------------------------------------------------------------------------


class OrgUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    level_label: str
    description: str


class OrgUnitCreate(BaseModel):
    name: str = Name
    level_label: str = Field(default="", max_length=60)
    description: str = Notes
    parent_id: uuid.UUID | None = None


class OrgUnitUpdate(BaseModel):
    name: str | None = OptionalName
    level_label: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=50_000)
    parent_id: uuid.UUID | None = None


# --- contacts -------------------------------------------------------------------------------


class EmploymentRead(BaseModel):
    id: uuid.UUID
    company: Summary
    job_title: str | None
    start_date: date | None
    end_date: date | None


class EmploymentCreate(BaseModel):
    company_id: uuid.UUID
    job_title: str | None = Field(default=None, max_length=200)
    start_date: date | None = None
    end_date: date | None = None


class ContactRead(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    job_title: str | None
    email_work: str | None
    email_personal: str | None
    phone_work: str | None
    phone_mobile: str | None
    linkedin_url: str | None
    notes: str
    company: Summary | None
    org_unit: Summary | None
    tags: list[TagRead]
    archived_at: datetime | None
    created_at: datetime


class ContactDetail(ContactRead):
    employments: list[EmploymentRead]


class _ContactFields(BaseModel):
    job_title: str | None = Field(default=None, max_length=200)
    email_work: EmailStr | None = None
    email_personal: EmailStr | None = None
    phone_work: str | None = Field(default=None, max_length=40)
    phone_mobile: str | None = Field(default=None, max_length=40)
    linkedin_url: HttpUrl | None = None
    company_id: uuid.UUID | None = None
    org_unit_id: uuid.UUID | None = None


class ContactCreate(_ContactFields):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    notes: str = Notes
    tag_ids: list[uuid.UUID] = []


class ContactUpdate(_ContactFields):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=50_000)
    tag_ids: list[uuid.UUID] | None = None


class DuplicateCandidate(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    company: Summary | None
    reason: str  # "SAME_NAME" | "SAME_EMAIL"
