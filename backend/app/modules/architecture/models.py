"""Architectures, domains and their relations (ADR-0022, ADR-0023, ADR-0037).

Personal data (ADR-0010) attached to a client company: domains and architectures of different
companies are never mixed.
"""

import uuid
from enum import StrEnum

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import (
    ArchivableMixin,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    string_enum,
)
from app.shared.ownership import OwnedMixin


class Lifecycle(StrEnum):
    """As-is versus to-be, without time travel (Q-H8)."""

    CURRENT = "CURRENT"
    TARGET = "TARGET"
    DEPRECATED = "DEPRECATED"


class DomainKind(StrEnum):
    BUSINESS_DOMAIN = "BUSINESS_DOMAIN"
    APPLICATION = "APPLICATION"
    SERVICE = "SERVICE"
    DATABASE = "DATABASE"
    MESSAGING = "MESSAGING"
    EXTERNAL_SYSTEM = "EXTERNAL_SYSTEM"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    OTHER = "OTHER"


class Criticality(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RelationType(StrEnum):
    CALLS = "CALLS"
    DEPENDS_ON = "DEPENDS_ON"
    PUBLISHES_TO = "PUBLISHES_TO"
    SUBSCRIBES_TO = "SUBSCRIBES_TO"
    READS_FROM = "READS_FROM"
    WRITES_TO = "WRITES_TO"
    CUSTOM = "CUSTOM"


class SyncMode(StrEnum):
    SYNC = "SYNC"
    ASYNC = "ASYNC"


class ExternalLinkKind(StrEnum):
    REPOSITORY = "REPOSITORY"
    TICKETS = "TICKETS"
    ENVIRONMENT = "ENVIRONMENT"
    DOCUMENTATION = "DOCUMENTATION"
    MONITORING = "MONITORING"
    OTHER = "OTHER"


class LinkedEntity(StrEnum):
    """Entities that carry external links (ADR-0023)."""

    DOMAIN = "DOMAIN"
    MISSION = "MISSION"
    SUBJECT = "SUBJECT"


class Architecture(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "architectures"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    lifecycle: Mapped[Lifecycle] = mapped_column(
        string_enum(Lifecycle, "lifecycle"), default=Lifecycle.CURRENT
    )


class MissionArchitecture(Base):
    __tablename__ = "mission_architectures"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), primary_key=True
    )
    architecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architectures.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Domain(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, OwnedMixin, Base):
    __tablename__ = "domains"
    __table_args__ = (
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_own_parent"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    # RESTRICT: sub-domains are moved or deleted first (ADR-0037).
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[DomainKind] = mapped_column(string_enum(DomainKind, "domain_kind", length=24))
    description: Mapped[str] = mapped_column(Text, default="")
    criticality: Mapped[Criticality | None] = mapped_column(string_enum(Criticality, "criticality"))
    lifecycle: Mapped[Lifecycle] = mapped_column(
        string_enum(Lifecycle, "lifecycle"), default=Lifecycle.CURRENT
    )
    # RESTRICT: an org unit owning a domain cannot be deleted (ENTITY_REFERENCED).
    owner_org_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_units.id", ondelete="RESTRICT"), index=True
    )
    referent_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="RESTRICT"), index=True
    )


class ArchitectureDomain(Base):
    """A member domain of an architecture; its sub-domains belong to it implicitly."""

    __tablename__ = "architecture_domains"

    architecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architectures.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class DomainRelation(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "domain_relations"
    __table_args__ = (
        # RG-09: a domain is never related to itself.
        CheckConstraint("source_id <> target_id", name="not_self"),
        CheckConstraint("type <> 'CUSTOM' OR label IS NOT NULL", name="custom_has_label"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[RelationType] = mapped_column(string_enum(RelationType, "relation_type"))
    label: Mapped[str | None] = mapped_column(String(200))
    protocol: Mapped[str | None] = mapped_column(String(60))
    sync_mode: Mapped[SyncMode | None] = mapped_column(string_enum(SyncMode, "sync_mode"))
    lifecycle: Mapped[Lifecycle] = mapped_column(
        string_enum(Lifecycle, "lifecycle"), default=Lifecycle.CURRENT
    )
    description: Mapped[str] = mapped_column(Text, default="")


class DomainTechnology(Base):
    __tablename__ = "domain_technologies"

    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True
    )
    technology_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("technologies.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    version: Mapped[str | None] = mapped_column(String(50))


class SubjectDomain(Base):
    """Agenda subject <-> architecture domain: the bridge between the two sub-apps (Q-G5)."""

    __tablename__ = "subject_domains"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class ExternalLink(UUIDPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """Repository, ticket board, environment... of a domain, mission or subject (Q-H9).

    Polymorphic, no foreign key on entity_id: services check the entity and clean up on delete.
    """

    __tablename__ = "external_links"
    __table_args__ = (Index("ix_external_links_entity", "entity_type", "entity_id"),)

    entity_type: Mapped[LinkedEntity] = mapped_column(string_enum(LinkedEntity, "linked_entity"))
    entity_id: Mapped[uuid.UUID] = mapped_column()
    kind: Mapped[ExternalLinkKind] = mapped_column(
        string_enum(ExternalLinkKind, "external_link_kind")
    )
    label: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(1000))


class DomainLayout(Base):
    """A position moved by hand in an architecture's graph view (ADR-0025, ADR-0038)."""

    __tablename__ = "domain_layouts"

    architecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architectures.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
