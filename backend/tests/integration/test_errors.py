"""Unified error format (ADR-0014), exercised through a throwaway router."""

from collections.abc import AsyncIterator

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.main import create_app


def _app_with_test_routes(settings: Settings) -> FastAPI:
    app = create_app(settings)
    router = APIRouter(prefix="/api/v1/_test")

    @router.get("/app-error")
    async def app_error() -> None:
        raise AppError(ErrorCode.NOT_FOUND, status_code=404, params={"id": "42"})

    @router.get("/crash")
    async def crash() -> None:
        raise RuntimeError("unexpected")

    @router.get("/typed")
    async def typed(count: int) -> dict[str, int]:
        return {"count": count}

    app.include_router(router)
    return app


@pytest.fixture
async def http(settings: Settings) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_app_with_test_routes(settings), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        yield client


async def test_app_error_is_serialized(http: AsyncClient) -> None:
    response = await http.get("/api/v1/_test/app-error")
    assert response.status_code == 404
    assert response.json() == {"code": "NOT_FOUND", "detail": "NOT_FOUND", "params": {"id": "42"}}


async def test_unknown_route_returns_not_found_code(http: AsyncClient) -> None:
    response = await http.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


async def test_wrong_method_returns_method_not_allowed_code(http: AsyncClient) -> None:
    response = await http.post("/api/v1/_test/typed")
    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"


async def test_validation_error_lists_fields(http: AsyncClient) -> None:
    response = await http.get("/api/v1/_test/typed", params={"count": "abc"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["params"]["fields"][0]["location"] == ["query", "count"]


async def test_unhandled_error_is_masked(http: AsyncClient) -> None:
    response = await http.get("/api/v1/_test/crash")
    assert response.status_code == 500
    assert response.json() == {
        "code": "INTERNAL_ERROR",
        "detail": "Internal server error",
        "params": {},
    }


async def test_cors_enabled_when_origins_configured(settings: Settings) -> None:
    app = create_app(settings.model_copy(update={"cors_origins": "http://localhost:5173"}))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        response = await client.options(
            "/api/v1/health",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
        )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
