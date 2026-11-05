from fastapi import FastAPI
from sqlalchemy import text

from app.core import db
from app.core.config import Settings
from app.main import lifespan


async def test_get_session_yields_a_working_session(migrated_database: Settings) -> None:
    async for session in db.get_session():
        assert (await session.execute(text("SELECT 1"))).scalar_one() == 1
    await db.dispose_engine()
    assert db.get_engine.cache_info().currsize == 0


async def test_dispose_engine_is_a_noop_when_unused() -> None:
    await db.dispose_engine()
    await db.dispose_engine()
    assert db.get_engine.cache_info().currsize == 0


async def test_lifespan_disposes_engine_on_shutdown(migrated_database: Settings) -> None:
    db.get_engine()
    async with lifespan(FastAPI()):
        assert db.get_engine.cache_info().currsize == 1
    assert db.get_engine.cache_info().currsize == 0
