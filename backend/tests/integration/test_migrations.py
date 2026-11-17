"""Migration round-trip: upgrade head -> downgrade base -> upgrade head -> no diff with the
models (ADR-0016, P12-7)."""

import pytest
from alembic.script import ScriptDirectory

from alembic import command
from app.core.config import Settings
from tests.conftest import alembic_config


@pytest.mark.migrations
def test_migrations_round_trip(migrated_database: Settings) -> None:
    config = alembic_config(migrated_database)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    # The rebuilt schema matches the models exactly (P12-7): raises on any difference.
    command.check(config)


def test_single_migration_head(migrated_database: Settings) -> None:
    script = ScriptDirectory.from_config(alembic_config(migrated_database))
    assert len(script.get_heads()) == 1


@pytest.mark.migrations
def test_0013_moves_mission_links_into_a_default_project(migrated_database: Settings) -> None:
    """ADR-0042: architecture links and attached document trees go to a "Général" project."""
    import asyncio
    import uuid

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    config = alembic_config(migrated_database)
    command.downgrade(config, "0012")
    ids = {name: uuid.uuid4() for name in ("user", "co", "m1", "m2", "arch", "d1", "d2", "d3")}

    async def run(statements: list[str]) -> list[list[tuple[object, ...]]]:
        """Executes the statements in one transaction; returns the rows of each SELECT."""
        engine = create_async_engine(migrated_database.database_url)
        results: list[list[tuple[object, ...]]] = []
        try:
            async with engine.begin() as connection:
                for statement in statements:
                    result = await connection.execute(text(statement), ids)
                    results.append([tuple(r) for r in result.all()] if result.returns_rows else [])
        finally:
            await engine.dispose()
        return results

    asyncio.run(
        run(
            [
                "INSERT INTO users (id, email, password_hash, display_name, role, locale, theme,"
                " is_active) VALUES (:user, 'mig@example.com', 'x', 'Mig', 'USER', 'fr', 'auto',"
                " true)",
                "INSERT INTO companies (id, name, normalized_name, types, notes)"
                " VALUES (:co, 'Bank', 'bank', '{CLIENT}', '')",
                "INSERT INTO missions (id, owner_id, title, job_title, client_id,"
                " employer_company_id, start_date, status, objectives, description, review,"
                " color) VALUES"
                " (:m1, :user, 'M1', 'Dev', :co, :co, '2026-01-05', 'ACTIVE', '', '', '', 'blue'),"
                " (:m2, :user, 'M2', 'Dev', :co, :co, '2026-01-05', 'ACTIVE', '', '', '', 'red')",
                "INSERT INTO architectures (id, owner_id, company_id, name, normalized_name,"
                " description, lifecycle) VALUES (:arch, :user, :co, 'SI', 'si', '', 'CURRENT')",
                "INSERT INTO mission_architectures (mission_id, architecture_id)"
                " VALUES (:m1, :arch)",
                # d1 (attached to m1) > d2; d3 unattached.
                "INSERT INTO documents (id, owner_id, title, slug, content_md)"
                " VALUES (:d1, :user, 'D1', 'd1', ''), (:d3, :user, 'D3', 'd3', '')",
                "INSERT INTO documents (id, owner_id, parent_id, title, slug, content_md)"
                " VALUES (:d2, :user, :d1, 'D2', 'd2', '')",
                "INSERT INTO document_attachments (document_id, entity_type, entity_id)"
                " VALUES (:d1, 'mission', :m1)",
            ]
        )
    )
    try:
        command.upgrade(config, "0013")
        projects, links, documents = asyncio.run(
            run(
                [
                    "SELECT mission_id, name FROM projects WHERE owner_id = :user",
                    "SELECT p.mission_id, pa.architecture_id FROM project_architectures pa"
                    " JOIN projects p ON p.id = pa.project_id",
                    "SELECT d.title, p.mission_id FROM documents d"
                    " LEFT JOIN projects p ON p.id = d.project_id WHERE d.owner_id = :user"
                    " ORDER BY d.title",
                ]
            )
        )
        assert projects == [(ids["m1"], "Général")]  # m2 had nothing to move
        assert links == [(ids["m1"], ids["arch"])]
        assert documents == [("D1", ids["m1"]), ("D2", ids["m1"]), ("D3", None)]
    finally:
        command.downgrade(config, "base")
        command.upgrade(config, "head")
