"""Shared test fixtures.

Integration tests run against a real PostgreSQL database (ADR-0003, ADR-0016) named
``<POSTGRES_DB>_test``, created on demand and migrated with Alembic once per session.
Each test runs inside a transaction that is rolled back afterwards.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import asyncpg
import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from alembic import command
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.main import create_app
from app.modules.auth.models import User, UserRole
from app.modules.auth.schemas import UserCreate
from app.modules.auth.service import UserService

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _test_settings() -> Settings:
    base = Settings()
    test_db = base.postgres_db if base.postgres_db.endswith("_test") else f"{base.postgres_db}_test"
    # Root base path: httpx only sends cookies whose Path matches the request URL.
    return Settings(environment="test", postgres_db=test_db, log_level="WARNING", base_path="")


@pytest.fixture(scope="session")
def settings() -> Iterator[Settings]:
    test_settings = _test_settings()
    os.environ["POSTGRES_DB"] = test_settings.postgres_db
    os.environ["ENVIRONMENT"] = "test"
    os.environ["BASE_PATH"] = ""
    get_settings.cache_clear()
    yield test_settings
    get_settings.cache_clear()


async def _create_database_if_missing(settings: Settings) -> None:
    conn = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        database="postgres",
    )
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", settings.postgres_db
        )
        if not exists:
            # Identifier comes from our own settings, not user input.
            await conn.execute(f'CREATE DATABASE "{settings.postgres_db}"')
    finally:
        await conn.close()


def alembic_config(settings: Settings) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["database_url"] = settings.database_url.render_as_string(hide_password=False)
    config.attributes["configure_logger"] = False
    return config


@pytest.fixture(scope="session")
def migrated_database(settings: Settings) -> Settings:
    asyncio.run(_create_database_if_missing(settings))
    config = alembic_config(settings)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    return settings


@pytest.fixture(scope="session")
async def engine(migrated_database: Settings) -> AsyncIterator[AsyncEngine]:
    db_engine = create_async_engine(migrated_database.database_url)
    yield db_engine
    await db_engine.dispose()


@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest.fixture
async def client(settings: Settings, db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app(settings)

    async def _session_override() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as http_client:
        yield http_client


# --- authentication helpers -------------------------------------------------------------

STRONG_PASSWORD = "Correct-Horse-42"  # noqa: S105 - test fixture


class FrozenClock:
    """Controllable replacement for app.core.clock.utcnow."""

    def __init__(self) -> None:
        self.now = datetime.now(UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FrozenClock:
    frozen = FrozenClock()
    for module in (
        "app.modules.auth.service",
        "app.modules.missions.service",
        "app.modules.agenda.service",
    ):
        monkeypatch.setattr(f"{module}.utcnow", frozen)
    return frozen


@pytest.fixture
def make_user(db_session: AsyncSession) -> Callable[..., Awaitable[User]]:
    async def _make(
        email: str = "user@example.com",
        password: str = STRONG_PASSWORD,
        role: UserRole = UserRole.USER,
        display_name: str = "Test User",
    ) -> User:
        return await UserService(db_session).create(
            UserCreate(email=email, password=password, role=role, display_name=display_name)
        )

    return _make


async def login(client: AsyncClient, email: str, password: str = STRONG_PASSWORD) -> Response:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


@pytest.fixture
async def user_client(
    client: AsyncClient, make_user: Callable[..., Awaitable[User]]
) -> AsyncClient:
    await make_user("user@example.com")
    await login(client, "user@example.com")
    return client


@pytest.fixture
async def admin_client(
    client: AsyncClient, make_user: Callable[..., Awaitable[User]]
) -> AsyncClient:
    await make_user("admin@example.com", role=UserRole.ADMIN, display_name="Admin")
    await login(client, "admin@example.com")
    return client
