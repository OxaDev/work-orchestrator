"""Agenda (macro): half-days, subtypes, monthly locks (ADR-0018, ADR-0019, ADR-0021, ADR-0033)."""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
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
        ForeignKey("half_day_subtypes.id", ondelete="RESTRICT")
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
