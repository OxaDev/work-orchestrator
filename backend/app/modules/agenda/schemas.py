import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.agenda.models import HalfDayKind, LockAction, Period, WorkLocation
from app.modules.directory.schemas import Summary

MAX_SLOTS = 800  # a bit more than a year of half-days


class Slot(BaseModel):
    date: date
    period: Period


class HalfDayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    period: Period
    kind: HalfDayKind
    subtype_id: uuid.UUID | None
    mission_id: uuid.UUID | None
    location: WorkLocation | None
    note: str | None


class HalfDayValues(BaseModel):
    """What to put in one or many half-days."""

    kind: HalfDayKind
    subtype_id: uuid.UUID | None = None
    mission_id: uuid.UUID | None = None
    location: WorkLocation | None = None
    note: str | None = Field(default=None, max_length=500)


class HalfDayAssign(HalfDayValues):
    slots: list[Slot] = Field(min_length=1, max_length=MAX_SLOTS)


class SlotList(BaseModel):
    slots: list[Slot] = Field(min_length=1, max_length=MAX_SLOTS)


class BulkResult(BaseModel):
    items: list[HalfDayRead]
    count: int


class PublicHoliday(BaseModel):
    date: date
    name: str


class HolidayGenerationResult(BaseModel):
    created: int
    skipped_locked: int
    already_generated: bool


class KindDays(BaseModel):
    kind: HalfDayKind
    days: float


class MissionDays(BaseModel):
    mission: Summary
    color: str
    days: float


class LocationDays(BaseModel):
    location: WorkLocation
    days: float


class Stats(BaseModel):
    period_start: date
    period_end: date
    # Weekdays that are not public holidays.
    working_days: float
    filled_days: float
    by_kind: list[KindDays]
    by_mission: list[MissionDays]
    by_location: list[LocationDays]
    unfilled_count: int


class Unfilled(BaseModel):
    count: int
    since: date
    until: date
    slots: list[Slot]


class MonthSummary(BaseModel):
    year: int
    month: int
    locked: bool
    locked_at: datetime | None


class LockEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    action: LockAction
    reason: str | None
    at: datetime


class MonthStatus(MonthSummary):
    note: str | None
    missing: list[Slot]
    stats: Stats
    events: list[LockEventRead]


class LockRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class UnlockRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SubtypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: HalfDayKind
    name_fr: str
    name_en: str


class SubtypeWithUsage(SubtypeRead):
    usage: int


class SubtypeCreate(BaseModel):
    kind: HalfDayKind
    name_fr: str = Field(min_length=1, max_length=80)
    name_en: str = Field(min_length=1, max_length=80)


class SubtypeUpdate(BaseModel):
    name_fr: str | None = Field(default=None, min_length=1, max_length=80)
    name_en: str | None = Field(default=None, min_length=1, max_length=80)
