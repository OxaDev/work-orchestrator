"""Shared referentials: sectors, companies, client organisation, contacts (ADR-0010, ADR-0031).

These tables are instance-wide (no owner): every user sees the same directory.
"""

import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import Column, Date, ForeignKey, String, Table, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import ArchivableMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin


class CompanyType(StrEnum):
    CLIENT = "CLIENT"
    ESN = "ESN"
    OTHER = "OTHER"


company_secondary_sectors = Table(
    "company_secondary_sectors",
    Base.metadata,
    Column("company_id", ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True),
    Column("sector_id", ForeignKey("sectors.id", ondelete="RESTRICT"), primary_key=True),
)


class Sector(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Business sector, hierarchical (Q-C3). Labels in both UI languages (ADR-0013)."""

    __tablename__ = "sectors"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sectors.id", ondelete="RESTRICT"), index=True
    )
    name_fr: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))


class Company(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200), unique=True)
    # Several roles at once are possible (a client that is also an ESN partner).
    types: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)
    primary_sector_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sectors.id", ondelete="RESTRICT"), index=True
    )
    parent_company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    website: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(Text, default="")

    secondary_sectors: Mapped[list[Sector]] = relationship(
        secondary=company_secondary_sectors, lazy="raise"
    )


class OrgUnit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Direction / pôle / équipe / squad... of a company: free-label tree (Q-H7, ADR-0022)."""

    __tablename__ = "org_units"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_units.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    level_label: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(Text, default="")


class Contact(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, Base):
    """Global directory entry (Q-D1). The current employer is `company_id`."""

    __tablename__ = "contacts"

    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    # "firstname lastname" normalised, for search and duplicate detection (P2-9).
    normalized_name: Mapped[str] = mapped_column(String(210), index=True)
    job_title: Mapped[str | None] = mapped_column(String(200))
    email_work: Mapped[str | None] = mapped_column(String(320), index=True)
    email_personal: Mapped[str | None] = mapped_column(String(320), index=True)
    phone_work: Mapped[str | None] = mapped_column(String(40))
    phone_mobile: Mapped[str | None] = mapped_column(String(40))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(Text, default="")
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    org_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_units.id", ondelete="RESTRICT"), index=True
    )


class ContactEmployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Past (or current) positions of a contact (Q-D2)."""

    __tablename__ = "contact_employments"

    contact_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contacts.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True
    )
    job_title: Mapped[str | None] = mapped_column(String(200))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
