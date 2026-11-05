"""Missions (ADR-0017, ADR-0032): personal data, one owner each (ADR-0010)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import (
    ArchivableMixin,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    string_enum,
)
from app.shared.ownership import OwnedMixin


class MissionStatus(StrEnum):
    PROSPECT = "PROSPECT"
    ACTIVE = "ACTIVE"
    ON_HOLD = "ON_HOLD"
    ENDED = "ENDED"


class Mission(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "missions"
    __table_args__ = (
        CheckConstraint(
            "planned_end_date IS NULL OR planned_end_date >= start_date",
            name="planned_end_after_start",
        ),
        CheckConstraint(
            "actual_end_date IS NULL OR actual_end_date >= start_date",
            name="actual_end_after_start",
        ),
    )

    title: Mapped[str] = mapped_column(String(200))
    job_title: Mapped[str] = mapped_column(String(200))
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    # Frozen copy of the user's ESN at creation time (ADR-0017).
    employer_company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date)
    planned_end_date: Mapped[date | None] = mapped_column(Date)
    actual_end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[MissionStatus] = mapped_column(
        string_enum(MissionStatus, "mission_status"), default=MissionStatus.ACTIVE
    )
    location: Mapped[str | None] = mapped_column(String(200))
    remote_policy: Mapped[str | None] = mapped_column(String(200))
    objectives: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    review: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20))
    daily_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))


class MissionEndDateChange(UUIDPrimaryKeyMixin, Base):
    """History of planned end date changes: renewals, amendments (Q-C6)."""

    __tablename__ = "mission_end_date_changes"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), index=True
    )
    old_date: Mapped[date | None] = mapped_column(Date)
    new_date: Mapped[date | None] = mapped_column(Date)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))


class ContactRole(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Instance-wide, editable list of roles a contact plays in a mission (Q-D3)."""

    __tablename__ = "contact_roles"

    name_fr: Mapped[str] = mapped_column(String(80))
    name_en: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80), unique=True)


class MissionContact(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "mission_contacts"
    __table_args__ = (UniqueConstraint("mission_id", "contact_id"),)

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contacts.id", ondelete="RESTRICT"), index=True
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("contact_roles.id", ondelete="RESTRICT")
    )
    note: Mapped[str | None] = mapped_column(String(500))


class MissionTechnology(UUIDPrimaryKeyMixin, Base):
    """Weighted involvement of a technology in a mission, 1 (touched) to 5 (core) (Q-J1)."""

    __tablename__ = "mission_technologies"
    __table_args__ = (
        UniqueConstraint("mission_id", "technology_id"),
        CheckConstraint("weight BETWEEN 1 AND 5", name="weight_range"),
    )

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), index=True
    )
    technology_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("technologies.id", ondelete="RESTRICT"), index=True
    )
    weight: Mapped[int] = mapped_column(SmallInteger)
    version: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(500))
