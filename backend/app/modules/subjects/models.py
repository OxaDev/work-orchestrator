"""Subjects: hierarchical work themes tasks are about (ADR-0022, ADR-0034, RG-07, RG-08)."""

import uuid
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import (
    ArchivableMixin,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    string_enum,
)
from app.shared.ownership import OwnedMixin


class SubjectScope(StrEnum):
    """Who the work is for; drives where its tasks may be placed (ADR-0020)."""

    MISSION = "MISSION"
    INTERCONTRACT = "INTERCONTRACT"
    TRAINING = "TRAINING"
    PERSONAL = "PERSONAL"


class SubjectStatus(StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class SubjectCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Instance-wide, editable list (veille, avant-vente, certification...) (Q-G6)."""

    __tablename__ = "subject_categories"

    name_fr: Mapped[str] = mapped_column(String(80))
    name_en: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80), unique=True)


class Subject(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "subjects"
    __table_args__ = (
        CheckConstraint(
            "(scope = 'MISSION') = (mission_id IS NOT NULL)", name="mission_iff_scope_mission"
        ),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_own_parent"),
    )

    # RESTRICT: children must be moved or deleted first (ADR-0022).
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="RESTRICT"), index=True
    )
    scope: Mapped[SubjectScope] = mapped_column(string_enum(SubjectScope, "subject_scope"))
    # RESTRICT: a mission with subjects is archived, not deleted (ADR-0032).
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="RESTRICT"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subject_categories.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[SubjectStatus] = mapped_column(
        string_enum(SubjectStatus, "subject_status"), default=SubjectStatus.OPEN
    )
    external_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")
