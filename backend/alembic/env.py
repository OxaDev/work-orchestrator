"""Alembic environment, async (ADR-0004). The URL is taken from application settings."""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.core.config import get_settings
from app.models import Base  # imports every model so autogenerate sees them

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(
    obj: object,  # noqa: ARG001 - signature imposed by Alembic
    name: str | None,
    type_: str,
    reflected: bool,  # noqa: ARG001
    compare_to: object,  # noqa: ARG001
) -> bool:
    """Search columns and indexes live in the migrations only (ADR-0040): never drop them."""
    if type_ == "column" and name == "search_vector":
        return False
    return not (
        type_ == "index"
        and name is not None
        and (name.endswith("_search") or name.endswith("_name_trgm"))
    )


def _database_url() -> str:
    url = config.attributes.get("database_url") or get_settings().database_url
    return url if isinstance(url, str) else url.render_as_string(hide_password=False)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_sync_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
