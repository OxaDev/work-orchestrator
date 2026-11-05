from collections.abc import AsyncIterator
from typing import Any

from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app import __version__
from app.core.config import Settings
from app.core.db import get_session
from app.main import create_app


async def test_health_reports_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": __version__}


class _BrokenSession:
    async def execute(self, *_: Any) -> None:
        raise OperationalError("SELECT 1", {}, ConnectionRefusedError("down"))


async def test_health_returns_503_with_error_code_when_database_down(settings: Settings) -> None:
    app = create_app(settings)

    async def _broken() -> AsyncIterator[_BrokenSession]:
        yield _BrokenSession()

    app.dependency_overrides[get_session] = _broken
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as http:
        response = await http.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["code"] == "DATABASE_UNAVAILABLE"


async def test_openapi_reflects_server_root_path(settings: Settings) -> None:
    # `uvicorn --root-path` sets the ASGI root_path; OpenAPI must expose it (ADR-0011).
    transport = ASGITransport(app=create_app(settings), root_path="/work-orchestrator")
    async with AsyncClient(transport=transport, base_url="http://t") as http:
        response = await http.get("/api/openapi.json")
    assert response.status_code == 200
    assert response.json()["servers"] == [{"url": "/work-orchestrator"}]
