"""Markdown documents, versions, links, entity attachments, files, templates (ADR-0024, ADR-0027,
ADR-0036)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
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
)
from app.shared.ownership import OwnedMixin


class Document(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("owner_id", "slug"),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_own_parent"),
    )

    # RESTRICT: a page with sub-pages is archived, not deleted (ADR-0022).
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220))
    content_md: Mapped[str] = mapped_column(Text, default="")
    # Autosaved, not yet saved explicitly: no version (ADR-0024).
    draft_md: Mapped[str | None] = mapped_column(Text)
    draft_saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DocumentVersion(UUIDPrimaryKeyMixin, Base):
    """Snapshot taken at each explicit save or restore."""

    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "number"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    content_md: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DocumentAttachment(Base):
    """A document attached to an entity (mission, company, subject...), Q-I1."""

    __tablename__ = "document_attachments"
    __table_args__ = (Index("ix_document_attachments_entity", "entity_type", "entity_id"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    entity_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class DocumentLink(Base):
    """Outgoing wikilink of a document, rebuilt on every save: backlinks (ADR-0024)."""

    __tablename__ = "document_links"
    __table_args__ = (Index("ix_document_links_target", "target_type", "target_id"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    target_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    target_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(200))


class Attachment(UUIDPrimaryKeyMixin, OwnedMixin, Base):
    """An uploaded file stored on the uploads volume (ADR-0027)."""

    __tablename__ = "attachments"

    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DocumentTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Instance-wide, editable document templates (Q-I7)."""

    __tablename__ = "document_templates"

    name_fr: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    normalized_name: Mapped[str] = mapped_column(String(120), unique=True)
    content_md: Mapped[str] = mapped_column(Text, default="")
