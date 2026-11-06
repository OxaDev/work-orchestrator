"""Agenda: half-days, subtypes, monthly locks (ADR-0018, ADR-0019, ADR-0021, ADR-0033),
tasks and daily logs (ADR-0020, ADR-0034), week templates (ADR-0035)."""

import uuid
from datetime import date, datetime, time
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import Base, TimestampMixin, UUIDPrimaryKeyMixin, string_enum
from app.shared.ownership import OwnedMixin


class Period(StrEnum):
    AM = "AM"
    PM = "PM"


class HalfDayKind(StrEnum):
    """System kinds (ADR-0018): the kind says who pays for the time."""

    MISSION = "MISSION"
    INTERCONTRACT = "INTERCONTRACT"
    TRAINING = "TRAINING"
    LEAVE = "LEAVE"
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
    SICK_LEAVE = "SICK_LEAVE"
    OFF = "OFF"


WORKING_KINDS = frozenset({HalfDayKind.MISSION, HalfDayKind.INTERCONTRACT, HalfDayKind.TRAINING})


class WorkLocation(StrEnum):
    """Where the half-day was worked (ADR-0019)."""

    CLIENT_ON_SITE = "CLIENT_ON_SITE"
    REMOTE_ESN_OFFICE = "REMOTE_ESN_OFFICE"
    REMOTE_HOME = "REMOTE_HOME"
    REMOTE_OTHER = "REMOTE_OTHER"
    TRAVEL_MISSION = "TRAVEL_MISSION"
    TRAVEL_ESN = "TRAVEL_ESN"


class HalfDaySubtype(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Editable refinement of a kind (LEAVE -> CP, RTT...). Instance-wide referential."""

    __tablename__ = "half_day_subtypes"
    __table_args__ = (UniqueConstraint("kind", "normalized_name"),)

    kind: Mapped[HalfDayKind] = mapped_column(string_enum(HalfDayKind, "half_day_kind"))
    name_fr: Mapped[str] = mapped_column(String(80))
    name_en: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80))


class HalfDay(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "half_days"
    __table_args__ = (
        # RG-01: one half-day per owner, date and period.
        UniqueConstraint("owner_id", "date", "period"),
        # RG-02 (structural part): a mission iff the kind is MISSION.
        CheckConstraint(
            "(kind = 'MISSION') = (mission_id IS NOT NULL)", name="mission_iff_kind_mission"
        ),
        # ADR-0019: no location for absences.
        CheckConstraint(
            "location IS NULL OR kind IN ('MISSION', 'INTERCONTRACT', 'TRAINING')",
            name="location_only_when_working",
        ),
    )

    date: Mapped[date] = mapped_column(Date)
    period: Mapped[Period] = mapped_column(string_enum(Period, "half_day_period"))
    kind: Mapped[HalfDayKind] = mapped_column(string_enum(HalfDayKind, "half_day_kind"))
    subtype_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("half_day_subtypes.id", ondelete="RESTRICT"), index=True
    )
    # RESTRICT: a mission with agenda history cannot be deleted (RG-12, ADR-0032).
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="RESTRICT"), index=True
    )
    location: Mapped[WorkLocation | None] = mapped_column(
        string_enum(WorkLocation, "work_location", length=24)
    )
    note: Mapped[str | None] = mapped_column(String(500))


class MonthLock(UUIDPrimaryKeyMixin, OwnedMixin, Base):
    """A validated month, timesheet-like (ADR-0021, RG-13)."""

    __tablename__ = "month_locks"
    __table_args__ = (
        UniqueConstraint("owner_id", "year", "month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="month_range"),
    )

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(SmallInteger)
    locked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))


class LockAction(StrEnum):
    LOCK = "LOCK"
    UNLOCK = "UNLOCK"


class MonthLockEvent(UUIDPrimaryKeyMixin, OwnedMixin, Base):
    __tablename__ = "month_lock_events"

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(SmallInteger)
    action: Mapped[LockAction] = mapped_column(string_enum(LockAction, "lock_action"))
    reason: Mapped[str | None] = mapped_column(String(500))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HolidayGeneration(UUIDPrimaryKeyMixin, OwnedMixin, Base):
    """Years whose public holidays were pre-filled: never re-added after a manual change."""

    __tablename__ = "holiday_generations"
    __table_args__ = (UniqueConstraint("owner_id", "year"),)

    year: Mapped[int] = mapped_column(Integer)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TaskKind(StrEnum):
    TASK = "TASK"
    MEETING = "MEETING"


class TaskStatus(StrEnum):
    PLANNED = "PLANNED"
    DONE = "DONE"
    CANCELLED = "CANCELLED"
    CARRIED_OVER = "CARRIED_OVER"


# RG-06: statuses whose durations fill a half-day (cancelled / carried-over time went elsewhere).
COUNTED_STATUSES = frozenset({TaskStatus.PLANNED, TaskStatus.DONE})


class Task(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """Work on a subject inside one half-day (ADR-0020, ADR-0034)."""

    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint("duration_minutes BETWEEN 1 AND 720", name="duration_range"),)

    # RESTRICT: a half-day holding tasks cannot be cleared (HALF_DAY_HAS_TASKS).
    half_day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("half_days.id", ondelete="RESTRICT"), index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="RESTRICT"), index=True
    )
    kind: Mapped[TaskKind] = mapped_column(string_enum(TaskKind, "task_kind"))
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[time | None] = mapped_column(Time)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger)
    status: Mapped[TaskStatus] = mapped_column(
        string_enum(TaskStatus, "task_status"), default=TaskStatus.PLANNED
    )
    description: Mapped[str] = mapped_column(Text, default="")
    external_ref: Mapped[str | None] = mapped_column(String(200))
    carried_from_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )


class TaskParticipant(Base):
    """Contacts attending a meeting (Q-G10)."""

    __tablename__ = "task_participants"

    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contacts.id", ondelete="RESTRICT"), primary_key=True, index=True
    )


class DailyLog(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """Daily note in three Markdown sections (Q-G1). Never locked (ADR-0021)."""

    __tablename__ = "daily_logs"
    __table_args__ = (UniqueConstraint("owner_id", "date"),)

    date: Mapped[date] = mapped_column(Date)
    done: Mapped[str] = mapped_column(Text, default="")
    planned: Mapped[str] = mapped_column(Text, default="")
    blockers: Mapped[str] = mapped_column(Text, default="")


class WeekTemplate(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """A typical week, applied by hand on a date range (Q-F1, Q-F2, ADR-0035)."""

    __tablename__ = "week_templates"
    __table_args__ = (UniqueConstraint("owner_id", "normalized_name"),)

    name: Mapped[str] = mapped_column(String(120))
    normalized_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # Default mission of MISSION slots without their own; the template is proposed for it (P6-5).
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="RESTRICT"), index=True
    )


class WeekTemplateSlot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "week_template_slots"
    __table_args__ = (
        UniqueConstraint("template_id", "weekday", "period"),
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_range"),
        CheckConstraint("mission_id IS NULL OR kind = 'MISSION'", name="mission_only_for_mission"),
        CheckConstraint(
            "location IS NULL OR kind IN ('MISSION', 'INTERCONTRACT', 'TRAINING')",
            name="location_only_when_working",
        ),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("week_templates.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column(SmallInteger)  # 0 = Monday
    period: Mapped[Period] = mapped_column(string_enum(Period, "half_day_period"))
    kind: Mapped[HalfDayKind] = mapped_column(string_enum(HalfDayKind, "half_day_kind"))
    subtype_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("half_day_subtypes.id", ondelete="RESTRICT"), index=True
    )
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="RESTRICT"), index=True
    )
    location: Mapped[WorkLocation | None] = mapped_column(
        string_enum(WorkLocation, "work_location", length=24)
    )
