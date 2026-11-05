from enum import StrEnum

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import (
    ArchivableMixin,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    string_enum,
)


class TechnologyCategory(StrEnum):
    LANGUAGE = "LANGUAGE"
    FRAMEWORK = "FRAMEWORK"
    LIBRARY = "LIBRARY"
    DATABASE = "DATABASE"
    MESSAGING = "MESSAGING"
    CLOUD = "CLOUD"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    DEVOPS = "DEVOPS"
    OBSERVABILITY = "OBSERVABILITY"
    SECURITY = "SECURITY"
    DATA = "DATA"
    TOOL = "TOOL"
    METHOD = "METHOD"
    OTHER = "OTHER"


class Technology(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, Base):
    """Instance-wide catalogue entry (ADR-0010). Versions live on links, not here (Q-J4)."""

    __tablename__ = "technologies"

    name: Mapped[str] = mapped_column(String(100))
    normalized_name: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[TechnologyCategory] = mapped_column(
        string_enum(TechnologyCategory, "technology_category"), default=TechnologyCategory.OTHER
    )
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String(100)), default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    website: Mapped[str | None] = mapped_column(String(500))
