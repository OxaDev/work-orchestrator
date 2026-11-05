"""Migration round-trip: upgrade head -> downgrade base -> upgrade head (ADR-0016)."""

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


def test_single_migration_head(migrated_database: Settings) -> None:
    script = ScriptDirectory.from_config(alembic_config(migrated_database))
    assert len(script.get_heads()) == 1
