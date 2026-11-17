"""Projects between missions and their documents and architectures (ADR-0042).

Creates `projects` and `project_architectures`, adds `documents.project_id`, and moves the data:
every mission linked to an architecture or with attached documents gets a "Général" project that
takes over its architecture links and the trees of its attached top-level documents. The former
`mission_architectures` table is dropped.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-17 10:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_PROJECT = "Général"
DEFAULT_NORMALIZED = "general"


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_projects_mission_id_missions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_projects_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
        sa.UniqueConstraint(
            "mission_id", "normalized_name", name=op.f("uq_projects_mission_id_normalized_name")
        ),
    )
    op.create_index(op.f("ix_projects_mission_id"), "projects", ["mission_id"], unique=False)
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)
    op.create_table(
        "project_architectures",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("architecture_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["architecture_id"],
            ["architectures.id"],
            name=op.f("fk_project_architectures_architecture_id_architectures"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_architectures_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "project_id", "architecture_id", name=op.f("pk_project_architectures")
        ),
    )
    op.create_index(
        op.f("ix_project_architectures_architecture_id"),
        "project_architectures",
        ["architecture_id"],
        unique=False,
    )
    op.add_column("documents", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_documents_project_id"), "documents", ["project_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_documents_project_id_projects"),
        "documents",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    bind = op.get_bind()
    missions = bind.execute(
        sa.text(
            """
            SELECT m.id, m.owner_id FROM missions m
            WHERE m.id IN (SELECT mission_id FROM mission_architectures)
               OR m.id IN (SELECT entity_id FROM document_attachments
                           WHERE entity_type = 'mission')
            """
        )
    ).all()
    for mission_id, owner_id in missions:
        project_id = uuid.uuid4()
        bind.execute(
            sa.text(
                "INSERT INTO projects"
                " (id, owner_id, mission_id, name, normalized_name, description)"
                " VALUES (:id, :owner, :mission, :name, :normalized, '')"
            ),
            {
                "id": project_id,
                "owner": owner_id,
                "mission": mission_id,
                "name": DEFAULT_PROJECT,
                "normalized": DEFAULT_NORMALIZED,
            },
        )
        bind.execute(
            sa.text(
                "INSERT INTO project_architectures (project_id, architecture_id)"
                " SELECT :project, architecture_id FROM mission_architectures"
                " WHERE mission_id = :mission"
            ),
            {"project": project_id, "mission": mission_id},
        )
        # Top-level documents attached to the mission (and not yet filed), with their subtrees.
        bind.execute(
            sa.text(
                """
                WITH RECURSIVE tree(id) AS (
                    SELECT d.id FROM documents d
                    JOIN document_attachments a
                      ON a.document_id = d.id AND a.entity_type = 'mission'
                         AND a.entity_id = :mission
                    WHERE d.parent_id IS NULL AND d.project_id IS NULL
                    UNION
                    SELECT c.id FROM documents c JOIN tree t ON c.parent_id = t.id
                )
                UPDATE documents SET project_id = :project WHERE id IN (SELECT id FROM tree)
                """
            ),
            {"project": project_id, "mission": mission_id},
        )

    op.drop_index(
        op.f("ix_mission_architectures_architecture_id"), table_name="mission_architectures"
    )
    op.drop_table("mission_architectures")


def downgrade() -> None:
    op.create_table(
        "mission_architectures",
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("architecture_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["architecture_id"],
            ["architectures.id"],
            name=op.f("fk_mission_architectures_architecture_id_architectures"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["mission_id"],
            ["missions.id"],
            name=op.f("fk_mission_architectures_mission_id_missions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "mission_id", "architecture_id", name=op.f("pk_mission_architectures")
        ),
    )
    op.create_index(
        op.f("ix_mission_architectures_architecture_id"),
        "mission_architectures",
        ["architecture_id"],
        unique=False,
    )
    op.execute(
        """
        INSERT INTO mission_architectures (mission_id, architecture_id)
        SELECT DISTINCT p.mission_id, pa.architecture_id
        FROM project_architectures pa JOIN projects p ON p.id = pa.project_id
        """
    )
    op.drop_constraint(op.f("fk_documents_project_id_projects"), "documents", type_="foreignkey")
    op.drop_index(op.f("ix_documents_project_id"), table_name="documents")
    op.drop_column("documents", "project_id")
    op.drop_index(
        op.f("ix_project_architectures_architecture_id"), table_name="project_architectures"
    )
    op.drop_table("project_architectures")
    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_mission_id"), table_name="projects")
    op.drop_table("projects")
