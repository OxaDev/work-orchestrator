"""Tags and their polymorphic association to any taggable entity (ADR-0031)."""

import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import Base, TimestampMixin, UUIDPrimaryKeyMixin


class TaggableType(StrEnum):
    """Entities that can carry tags. Extend when a new module becomes taggable."""

    COMPANY = "COMPANY"
    CONTACT = "CONTACT"
    TECHNOLOGY = "TECHNOLOGY"


class Tag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(String(60))
    normalized_name: Mapped[str] = mapped_column(String(60), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="gray")


class Tagging(Base):
    """No foreign key on entity_id (polymorphic): integrity is kept by the services."""

    __tablename__ = "taggings"
    __table_args__ = (Index("ix_taggings_entity", "entity_type", "entity_id"),)

    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    entity_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
