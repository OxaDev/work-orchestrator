"""Every API route requires a session unless explicitly public (ADR-0030, P1-7)."""

import re
import uuid

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.main import create_app

PUBLIC_ROUTES = {
    ("GET", "/api/v1/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
}


def _api_routes(settings: Settings) -> list[tuple[str, str]]:
    # The OpenAPI schema is the public, version-stable view of every mounted route.
    paths = create_app(settings).openapi()["paths"]
    return sorted(
        (method.upper(), path)
        for path, operations in paths.items()
        if path.startswith("/api/v1")
        for method in operations
    )


def test_public_routes_exist_and_protected_routes_are_discovered(settings: Settings) -> None:
    routes = set(_api_routes(settings))
    assert routes >= PUBLIC_ROUTES
    assert ("GET", "/api/v1/users") in routes


@pytest.mark.parametrize("method_path", _api_routes(Settings(base_path="")))
async def test_route_requires_authentication(
    client: AsyncClient, method_path: tuple[str, str]
) -> None:
    method, path = method_path
    if method_path in PUBLIC_ROUTES:
        pytest.skip("public route")
    url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
    response = await client.request(method, url, json={})
    assert response.status_code == 401, f"{method} {path} is not protected"
    assert response.json()["code"] == "AUTH_REQUIRED"
