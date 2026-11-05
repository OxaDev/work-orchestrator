"""Missions, contact roles, mission contacts and technologies (P3).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-05 17:35:41.445733
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contact_roles",
        sa.Column("name_fr", sa.String(length=80), nullable=False),
        sa.Column("name_en", sa.String(length=80), nullable=False),
        sa.Column("normalized_name", sa.String(length=80), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contact_roles")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_contact_roles_normalized_name")),
    )
    op.create_table(
        "missions",
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("job_title", sa.String(length=200), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("employer_company_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("planned_end_date", sa.Date(), nullable=True),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "PROSPECT",
                "ACTIVE",
                "ON_HOLD",
                "ENDED",
                name="mission_status",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("remote_policy", sa.String(length=200), nullable=True),
        sa.Column("objectives", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("review", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("daily_rate", sa.Numeric(precision=10, scale=2), nullable=True),
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
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "actual_end_date IS NULL OR actual_end_date >= start_date",
            name=op.f("ck_missions_actual_end_after_start"),
        ),
        sa.CheckConstraint(
            "planned_end_date IS NULL OR planned_end_date >= start_date",
            name=op.f("ck_missions_planned_end_after_start"),
        ),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["companies.id"],
            name=op.f("fk_missions_client_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["employer_company_id"],
            ["companies.id"],
            name=op.f("fk_missions_employer_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_missions_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_missions")),
    )
    op.create_index(op.f("ix_missions_client_id"), "missions", ["client_id"], unique=False)
    op.create_index(
        op.f("ix_missions_employer_company_id"), "missions", ["employer_company_id"], unique=False
    )
    op.create_index(op.f("ix_missions_owner_id"), "missions", ["owner_id"], unique=False)
    op.create_table(
        "mission_contacts",
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("contact_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name=op.f("fk_mission_contacts_contact_id_contacts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_mission_contacts_mission_id_missions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["contact_roles.id"],
            name=op.f("fk_mission_contacts_role_id_contact_roles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mission_contacts")),
        sa.UniqueConstraint(
            "mission_id", "contact_id", name=op.f("uq_mission_contacts_mission_id_contact_id")
        ),
    )
    op.create_index(
        op.f("ix_mission_contacts_contact_id"), "mission_contacts", ["contact_id"], unique=False
    )
    op.create_index(
        op.f("ix_mission_contacts_mission_id"), "mission_contacts", ["mission_id"], unique=False
    )
    op.create_table(
        "mission_end_date_changes",
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("old_date", sa.Date(), nullable=True),
        sa.Column("new_date", sa.Date(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_mission_end_date_changes_mission_id_missions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mission_end_date_changes")),
    )
    op.create_index(
        op.f("ix_mission_end_date_changes_mission_id"),
        "mission_end_date_changes",
        ["mission_id"],
        unique=False,
    )
    op.create_table(
        "mission_technologies",
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("technology_id", sa.Uuid(), nullable=False),
        sa.Column("weight", sa.SmallInteger(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "weight BETWEEN 1 AND 5", name=op.f("ck_mission_technologies_weight_range")
        ),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_mission_technologies_mission_id_missions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["technology_id"],
            ["technologies.id"],
            name=op.f("fk_mission_technologies_technology_id_technologies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mission_technologies")),
        sa.UniqueConstraint(
            "mission_id",
            "technology_id",
            name=op.f("uq_mission_technologies_mission_id_technology_id"),
        ),
    )
    op.create_index(
        op.f("ix_mission_technologies_mission_id"),
        "mission_technologies",
        ["mission_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mission_technologies_technology_id"),
        "mission_technologies",
        ["technology_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_mission_technologies_technology_id"), table_name="mission_technologies")
    op.drop_index(op.f("ix_mission_technologies_mission_id"), table_name="mission_technologies")
    op.drop_table("mission_technologies")
    op.drop_index(
        op.f("ix_mission_end_date_changes_mission_id"), table_name="mission_end_date_changes"
    )
    op.drop_table("mission_end_date_changes")
    op.drop_index(op.f("ix_mission_contacts_mission_id"), table_name="mission_contacts")
    op.drop_index(op.f("ix_mission_contacts_contact_id"), table_name="mission_contacts")
    op.drop_table("mission_contacts")
    op.drop_index(op.f("ix_missions_owner_id"), table_name="missions")
    op.drop_index(op.f("ix_missions_employer_company_id"), table_name="missions")
    op.drop_index(op.f("ix_missions_client_id"), table_name="missions")
    op.drop_table("missions")
    op.drop_table("contact_roles")
