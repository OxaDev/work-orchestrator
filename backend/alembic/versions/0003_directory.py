"""Shared referentials: sectors, companies, org units, contacts, technologies, tags (P2).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05 17:12:05.716404
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sectors",
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("name_fr", sa.String(length=120), nullable=False),
        sa.Column("name_en", sa.String(length=120), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["sectors.id"],
            name=op.f("fk_sectors_parent_id_sectors"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sectors")),
    )
    op.create_index(op.f("ix_sectors_parent_id"), "sectors", ["parent_id"], unique=False)
    op.create_table(
        "tags",
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("normalized_name", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_tags_normalized_name")),
    )
    op.create_table(
        "technologies",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "LANGUAGE",
                "FRAMEWORK",
                "LIBRARY",
                "DATABASE",
                "MESSAGING",
                "CLOUD",
                "INFRASTRUCTURE",
                "DEVOPS",
                "OBSERVABILITY",
                "SECURITY",
                "DATA",
                "TOOL",
                "METHOD",
                "OTHER",
                name="technology_category",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("aliases", postgresql.ARRAY(sa.String(length=100)), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technologies")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_technologies_normalized_name")),
    )
    op.create_table(
        "companies",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("types", postgresql.ARRAY(sa.String(length=16)), nullable=False),
        sa.Column("primary_sector_id", sa.Uuid(), nullable=True),
        sa.Column("parent_company_id", sa.Uuid(), nullable=True),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_company_id"],
            ["companies.id"],
            name=op.f("fk_companies_parent_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["primary_sector_id"],
            ["sectors.id"],
            name=op.f("fk_companies_primary_sector_id_sectors"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_companies")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_companies_normalized_name")),
    )
    op.create_index(
        op.f("ix_companies_parent_company_id"), "companies", ["parent_company_id"], unique=False
    )
    op.create_index(
        op.f("ix_companies_primary_sector_id"), "companies", ["primary_sector_id"], unique=False
    )
    op.create_table(
        "taggings",
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name=op.f("fk_taggings_tag_id_tags"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tag_id", "entity_type", "entity_id", name=op.f("pk_taggings")),
    )
    op.create_index("ix_taggings_entity", "taggings", ["entity_type", "entity_id"], unique=False)
    op.create_table(
        "company_secondary_sectors",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("sector_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_company_secondary_sectors_company_id_companies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sector_id"],
            ["sectors.id"],
            name=op.f("fk_company_secondary_sectors_sector_id_sectors"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "company_id", "sector_id", name=op.f("pk_company_secondary_sectors")
        ),
    )
    op.create_table(
        "org_units",
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("level_label", sa.String(length=60), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_org_units_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["org_units.id"],
            name=op.f("fk_org_units_parent_id_org_units"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_units")),
    )
    op.create_index(op.f("ix_org_units_company_id"), "org_units", ["company_id"], unique=False)
    op.create_index(op.f("ix_org_units_parent_id"), "org_units", ["parent_id"], unique=False)
    op.create_table(
        "contacts",
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=210), nullable=False),
        sa.Column("job_title", sa.String(length=200), nullable=True),
        sa.Column("email_work", sa.String(length=320), nullable=True),
        sa.Column("email_personal", sa.String(length=320), nullable=True),
        sa.Column("phone_work", sa.String(length=40), nullable=True),
        sa.Column("phone_mobile", sa.String(length=40), nullable=True),
        sa.Column("linkedin_url", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("org_unit_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_contacts_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_units.id"],
            name=op.f("fk_contacts_org_unit_id_org_units"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contacts")),
    )
    op.create_index(op.f("ix_contacts_company_id"), "contacts", ["company_id"], unique=False)
    op.create_index(
        op.f("ix_contacts_email_personal"), "contacts", ["email_personal"], unique=False
    )
    op.create_index(op.f("ix_contacts_email_work"), "contacts", ["email_work"], unique=False)
    op.create_index(
        op.f("ix_contacts_normalized_name"), "contacts", ["normalized_name"], unique=False
    )
    op.create_index(op.f("ix_contacts_org_unit_id"), "contacts", ["org_unit_id"], unique=False)
    op.create_table(
        "contact_employments",
        sa.Column("contact_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("job_title", sa.String(length=200), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_contact_employments_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name=op.f("fk_contact_employments_contact_id_contacts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contact_employments")),
    )
    op.create_index(
        op.f("ix_contact_employments_company_id"),
        "contact_employments",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_contact_employments_contact_id"),
        "contact_employments",
        ["contact_id"],
        unique=False,
    )
    op.add_column("users", sa.Column("employer_company_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_employer_company_id_companies"),
        "users",
        "companies",
        ["employer_company_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_users_employer_company_id_companies"), "users", type_="foreignkey")
    op.drop_column("users", "employer_company_id")
    op.drop_index(op.f("ix_contact_employments_contact_id"), table_name="contact_employments")
    op.drop_index(op.f("ix_contact_employments_company_id"), table_name="contact_employments")
    op.drop_table("contact_employments")
    op.drop_index(op.f("ix_contacts_org_unit_id"), table_name="contacts")
    op.drop_index(op.f("ix_contacts_normalized_name"), table_name="contacts")
    op.drop_index(op.f("ix_contacts_email_work"), table_name="contacts")
    op.drop_index(op.f("ix_contacts_email_personal"), table_name="contacts")
    op.drop_index(op.f("ix_contacts_company_id"), table_name="contacts")
    op.drop_table("contacts")
    op.drop_index(op.f("ix_org_units_parent_id"), table_name="org_units")
    op.drop_index(op.f("ix_org_units_company_id"), table_name="org_units")
    op.drop_table("org_units")
    op.drop_table("company_secondary_sectors")
    op.drop_index("ix_taggings_entity", table_name="taggings")
    op.drop_table("taggings")
    op.drop_index(op.f("ix_companies_primary_sector_id"), table_name="companies")
    op.drop_index(op.f("ix_companies_parent_company_id"), table_name="companies")
    op.drop_table("companies")
    op.drop_table("technologies")
    op.drop_table("tags")
    op.drop_index(op.f("ix_sectors_parent_id"), table_name="sectors")
    op.drop_table("sectors")
