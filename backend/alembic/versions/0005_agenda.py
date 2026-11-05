"""Agenda: half-days, subtypes, monthly locks, holiday generations, user holiday region (P4).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-05 17:52:40.328945
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "half_day_subtypes",
        sa.Column(
            "kind",
            sa.Enum(
                "MISSION",
                "INTERCONTRACT",
                "TRAINING",
                "LEAVE",
                "PUBLIC_HOLIDAY",
                "SICK_LEAVE",
                "OFF",
                name="half_day_kind",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_half_day_subtypes")),
        sa.UniqueConstraint(
            "kind", "normalized_name", name=op.f("uq_half_day_subtypes_kind_normalized_name")
        ),
    )
    op.create_table(
        "holiday_generations",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_holiday_generations_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_holiday_generations")),
        sa.UniqueConstraint("owner_id", "year", name=op.f("uq_holiday_generations_owner_id_year")),
    )
    op.create_index(
        op.f("ix_holiday_generations_owner_id"), "holiday_generations", ["owner_id"], unique=False
    )
    op.create_table(
        "month_lock_events",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column(
            "action",
            sa.Enum(
                "LOCK",
                "UNLOCK",
                name="lock_action",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_month_lock_events_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_month_lock_events")),
    )
    op.create_index(
        op.f("ix_month_lock_events_owner_id"), "month_lock_events", ["owner_id"], unique=False
    )
    op.create_table(
        "month_locks",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name=op.f("ck_month_locks_month_range")),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_month_locks_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_month_locks")),
        sa.UniqueConstraint(
            "owner_id", "year", "month", name=op.f("uq_month_locks_owner_id_year_month")
        ),
    )
    op.create_index(op.f("ix_month_locks_owner_id"), "month_locks", ["owner_id"], unique=False)
    op.create_table(
        "half_days",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "period",
            sa.Enum(
                "AM",
                "PM",
                name="half_day_period",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "MISSION",
                "INTERCONTRACT",
                "TRAINING",
                "LEAVE",
                "PUBLIC_HOLIDAY",
                "SICK_LEAVE",
                "OFF",
                name="half_day_kind",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("subtype_id", sa.Uuid(), nullable=True),
        sa.Column("mission_id", sa.Uuid(), nullable=True),
        sa.Column(
            "location",
            sa.Enum(
                "CLIENT_ON_SITE",
                "REMOTE_ESN_OFFICE",
                "REMOTE_HOME",
                "REMOTE_OTHER",
                "TRAVEL_MISSION",
                "TRAVEL_ESN",
                name="work_location",
                native_enum=False,
                create_constraint=True,
                length=24,
            ),
            nullable=True,
        ),
        sa.Column("note", sa.String(length=500), nullable=True),
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
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "(kind = 'MISSION') = (mission_id IS NOT NULL)",
            name=op.f("ck_half_days_mission_iff_kind_mission"),
        ),
        sa.CheckConstraint(
            "location IS NULL OR kind IN ('MISSION', 'INTERCONTRACT', 'TRAINING')",
            name=op.f("ck_half_days_location_only_when_working"),
        ),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_half_days_mission_id_missions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_half_days_owner_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["subtype_id"],
            ["half_day_subtypes.id"],
            name=op.f("fk_half_days_subtype_id_half_day_subtypes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_half_days")),
        sa.UniqueConstraint(
            "owner_id", "date", "period", name=op.f("uq_half_days_owner_id_date_period")
        ),
    )
    op.create_index(op.f("ix_half_days_mission_id"), "half_days", ["mission_id"], unique=False)
    op.create_index(op.f("ix_half_days_owner_id"), "half_days", ["owner_id"], unique=False)
    op.add_column("users", sa.Column("holiday_subdivision", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "holiday_subdivision")
    op.drop_index(op.f("ix_half_days_owner_id"), table_name="half_days")
    op.drop_index(op.f("ix_half_days_mission_id"), table_name="half_days")
    op.drop_table("half_days")
    op.drop_index(op.f("ix_month_locks_owner_id"), table_name="month_locks")
    op.drop_table("month_locks")
    op.drop_index(op.f("ix_month_lock_events_owner_id"), table_name="month_lock_events")
    op.drop_table("month_lock_events")
    op.drop_index(op.f("ix_holiday_generations_owner_id"), table_name="holiday_generations")
    op.drop_table("holiday_generations")
    op.drop_table("half_day_subtypes")
