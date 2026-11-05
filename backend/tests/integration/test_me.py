"""Profile and own password (P1-9)."""

from collections.abc import Awaitable, Callable

from httpx import AsyncClient

from app.modules.auth.cookies import ACCESS_COOKIE, REFRESH_COOKIE
from app.modules.auth.models import User
from tests.conftest import STRONG_PASSWORD, FrozenClock, login

MakeUser = Callable[..., Awaitable[User]]
NEW_PASSWORD = "Another-Strong-7"  # noqa: S105


async def test_update_profile(user_client: AsyncClient) -> None:
    response = await user_client.patch(
        "/api/v1/me", json={"display_name": "Camille", "locale": "en", "theme": "dark"}
    )
    assert response.status_code == 200
    assert (
        response.json().items()
        >= {"display_name": "Camille", "locale": "en", "theme": "dark"}.items()
    )


async def test_partial_profile_update_keeps_other_fields(user_client: AsyncClient) -> None:
    response = await user_client.patch("/api/v1/me", json={"locale": "en"})
    assert response.json()["display_name"] == "Test User"
    assert response.json()["theme"] == "auto"


async def test_invalid_locale_is_rejected(user_client: AsyncClient) -> None:
    response = await user_client.patch("/api/v1/me", json={"locale": "de"})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


async def test_change_password_requires_current_password(user_client: AsyncClient) -> None:
    response = await user_client.post(
        "/api/v1/me/password",
        json={"current_password": "Wrong-Pass-123", "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "CURRENT_PASSWORD_INCORRECT"


async def test_change_password_enforces_policy(user_client: AsyncClient) -> None:
    response = await user_client.post(
        "/api/v1/me/password",
        json={"current_password": STRONG_PASSWORD, "new_password": "short"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "PASSWORD_TOO_SHORT"
    assert "PASSWORD_MISSING_DIGIT" in body["params"]["violations"]


async def test_change_password_revokes_other_sessions_but_keeps_this_one(
    client: AsyncClient, make_user: MakeUser, clock: FrozenClock
) -> None:
    await make_user("someone@example.com")
    await login(client, "someone@example.com")
    other_access = client.cookies.get(ACCESS_COOKIE) or ""
    other_refresh = client.cookies.get(REFRESH_COOKIE) or ""
    clock.advance(seconds=5)
    await login(client, "someone@example.com")

    response = await client.post(
        "/api/v1/me/password",
        json={"current_password": STRONG_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 200

    stale_access = await client.get("/api/v1/auth/me", cookies={ACCESS_COOKIE: other_access})
    assert stale_access.status_code == 401
    stale_refresh = await client.post(
        "/api/v1/auth/refresh", cookies={REFRESH_COOKIE: other_refresh}
    )
    assert stale_refresh.status_code == 401

    client.cookies.clear()
    await login(client, "someone@example.com", NEW_PASSWORD)
