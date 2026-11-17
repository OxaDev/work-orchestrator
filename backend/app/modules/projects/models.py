"""Projects (ADR-0042): the level between a mission and its documents and architectures."""

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import ArchivableMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.shared.ownership import OwnedMixin


class Project(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("mission_id", "normalized_name"),)

    # RESTRICT like every table referencing missions (ADR-0032).
    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
