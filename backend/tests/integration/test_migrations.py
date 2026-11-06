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
