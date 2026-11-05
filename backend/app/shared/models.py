"""Declarative base and common mixins for all ORM models."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.shared.ids import uuid7

# Deterministic constraint names so Alembic autogenerate produces stable migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ArchivableMixin:
    """Soft deletion for entities referenced elsewhere (ADR-0014)."""

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


def string_enum(enum: type[StrEnum], name: str, length: int = 16) -> Enum:
    """Enum stored as VARCHAR + CHECK constraint: adding a value needs no ALTER TYPE."""
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda members: [member.value for member in members],
    )
