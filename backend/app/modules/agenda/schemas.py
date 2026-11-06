import uuid
from datetime import date, datetime, time
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.agenda.models import (
    HalfDayKind,
    LockAction,
    Period,
    TaskKind,
    TaskStatus,
    WorkLocation,
)
from app.modules.directory.schemas import Summary
from app.modules.subjects.models import SubjectScope

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


# --- tasks (ADR-0020, ADR-0034) ---------------------------------------------------------------

Duration = Field(ge=1, le=720)
# Alias: inside a class, `date: date | None = None` would see the field's own default.
OptionalDate = date | None
MarkdownText = Field(default="", max_length=100_000)


class WarningCode(StrEnum):
    """Non-blocking notices returned with a successful write (translated by the client)."""

    HALF_DAY_OVERBOOKED = "HALF_DAY_OVERBOOKED"


class AgendaWarning(BaseModel):
    code: WarningCode
    params: dict[str, Any]


class SubjectRef(BaseModel):
    id: uuid.UUID
    title: str
    scope: SubjectScope
    mission_id: uuid.UUID | None


class TaskRead(BaseModel):
    id: uuid.UUID
    date: date
    period: Period
    subject: SubjectRef
    kind: TaskKind
    title: str
    starts_at: time | None
    duration_minutes: int
    status: TaskStatus
    description: str
    external_ref: str | None
    participants: list[Summary]
    carried_from_id: uuid.UUID | None
    # Domains linked to the task's subject: agenda -> architecture in one click (ADR-0039).
    domains: list[Summary]


class TaskCreate(BaseModel):
    date: date
    period: Period
    subject_id: uuid.UUID
    kind: TaskKind = TaskKind.TASK
    title: str = Field(min_length=1, max_length=200)
    starts_at: time | None = None
    duration_minutes: int = Duration
    status: TaskStatus = TaskStatus.PLANNED
    description: str = MarkdownText
    external_ref: str | None = Field(default=None, max_length=200)
    participant_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class TaskUpdate(BaseModel):
    """Omitted fields are unchanged. `date` / `period` move the task to another half-day."""

    date: OptionalDate = None
    period: Period | None = None
    subject_id: uuid.UUID | None = None
    kind: TaskKind | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    starts_at: time | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=720)
    status: TaskStatus | None = None
    description: str | None = Field(default=None, max_length=100_000)
    external_ref: str | None = Field(default=None, max_length=200)
    participant_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)


class TaskWriteResult(BaseModel):
    task: TaskRead
    warnings: list[AgendaWarning]


class CarryOverRequest(BaseModel):
    """Explicit `target`, or the next compatible half-day on or after `not_before`."""

    target: Slot | None = None
    not_before: date | None = None


class CompatibilityRule(BaseModel):
    kind: HalfDayKind
    scopes: list[SubjectScope]
    # MISSION half-days accept only subjects of their own mission (RG-04).
    same_mission: bool


class DailyLogRead(BaseModel):
    date: date
    done: str
    planned: str
    blockers: str
    updated_at: datetime | None


class DailyLogWrite(BaseModel):
    done: str = MarkdownText
    planned: str = MarkdownText
    blockers: str = MarkdownText


class Standup(BaseModel):
    day: date
    # Latest earlier day holding tasks (at most 14 days back).
    previous_day: date | None
    previous: list[TaskRead]
    today: list[TaskRead]
    log: DailyLogRead


# --- week templates (ADR-0035) ----------------------------------------------------------------

MAX_TEMPLATE_DAYS = 366


class TemplateSlot(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int = Field(ge=0, le=6, description="0 = Monday … 6 = Sunday")
    period: Period
    kind: HalfDayKind
    subtype_id: uuid.UUID | None = None
    # MISSION slots without a mission use the application's or the template's mission.
    mission_id: uuid.UUID | None = None
    location: WorkLocation | None = None


class WeekTemplateRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    mission_id: uuid.UUID | None
    slots: list[TemplateSlot]
    updated_at: datetime


class WeekTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5_000)
    mission_id: uuid.UUID | None = None
    slots: list[TemplateSlot] = Field(default_factory=list, max_length=14)


class WeekTemplateUpdate(BaseModel):
    """Omitted fields are unchanged; `slots` replaces every slot."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5_000)
    mission_id: uuid.UUID | None = None
    slots: list[TemplateSlot] | None = Field(default=None, max_length=14)


class DuplicateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ApplyStrategy(StrEnum):
    SKIP = "SKIP"  # RG-10: filled half-days are kept
    OVERWRITE = "OVERWRITE"


class TemplateApplication(BaseModel):
    start: date
    end: date
    strategy: ApplyStrategy = ApplyStrategy.SKIP
    # Mission for MISSION slots without one; defaults to the template's mission.
    mission_id: uuid.UUID | None = None


class PlanAction(StrEnum):
    """What applying the template does to one half-day, in order of precedence."""

    HOLIDAY = "HOLIDAY"
    LOCKED = "LOCKED"
    OUTSIDE_MISSION = "OUTSIDE_MISSION"
    CREATE = "CREATE"
    UNCHANGED = "UNCHANGED"
    KEEP = "KEEP"
    BLOCKED_BY_TASKS = "BLOCKED_BY_TASKS"
    OVERWRITE = "OVERWRITE"


class PlannedHalfDay(BaseModel):
    date: date
    period: Period
    action: PlanAction
    kind: HalfDayKind
    subtype_id: uuid.UUID | None
    mission_id: uuid.UUID | None
    location: WorkLocation | None
    existing: HalfDayRead | None


class ApplicationPlan(BaseModel):
    start: date
    end: date
    strategy: ApplyStrategy
    items: list[PlannedHalfDay]
    counts: dict[PlanAction, int]
    # Half-days written (CREATE + OVERWRITE); 0 for a preview.
    applied: int = 0
