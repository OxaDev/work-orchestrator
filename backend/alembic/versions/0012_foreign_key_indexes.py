"""Indexes on the foreign keys checked by deletes and SET NULL (P12-2, ADR-0041).

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-06 15:47:56.382349
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_company_secondary_sectors_sector_id",
        "company_secondary_sectors",
        ["sector_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_domains_referent_contact_id"), "domains", ["referent_contact_id"], unique=False
    )
    op.create_index(op.f("ix_half_days_subtype_id"), "half_days", ["subtype_id"], unique=False)
    op.create_index(
        op.f("ix_mission_contacts_role_id"), "mission_contacts", ["role_id"], unique=False
    )
    op.create_index(op.f("ix_subjects_category_id"), "subjects", ["category_id"], unique=False)
    op.create_index(op.f("ix_tasks_carried_from_id"), "tasks", ["carried_from_id"], unique=False)
    op.create_index(
        op.f("ix_users_employer_company_id"), "users", ["employer_company_id"], unique=False
    )
    op.create_index(
        op.f("ix_week_template_slots_subtype_id"),
        "week_template_slots",
        ["subtype_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_week_template_slots_subtype_id"), table_name="week_template_slots")
    op.drop_index(op.f("ix_users_employer_company_id"), table_name="users")
    op.drop_index(op.f("ix_tasks_carried_from_id"), table_name="tasks")
    op.drop_index(op.f("ix_subjects_category_id"), table_name="subjects")
    op.drop_index(op.f("ix_mission_contacts_role_id"), table_name="mission_contacts")
    op.drop_index(op.f("ix_half_days_subtype_id"), table_name="half_days")
    op.drop_index(op.f("ix_domains_referent_contact_id"), table_name="domains")
    op.drop_index("ix_company_secondary_sectors_sector_id", table_name="company_secondary_sectors")
