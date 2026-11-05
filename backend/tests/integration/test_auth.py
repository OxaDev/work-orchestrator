"""Login, session, refresh rotation, logout, throttling (ADR-0007, ADR-0030)."""

from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.db import get_session
from app.main import create_app
from app.modules.auth.cookies import ACCESS_COOKIE, REFRESH_COOKIE
from app.modules.auth.models import User
from tests.conftest import STRONG_PASSWORD, FrozenClock, login

MakeUser = Callable[..., Awaitable[User]]


async def test_login_sets_cookies_and_returns_user(
    client: AsyncClient, make_user: MakeUser, db_session: AsyncSession
) -> None:
    await make_user("Someone@Example.com")
    response = await login(client, "someone@example.com")
    body = response.json()
    assert body["email"] == "someone@example.com"
    assert "password_hash" not in body
    assert {ACCESS_COOKIE, REFRESH_COOKIE} <= set(response.cookies.keys())
    user = await db_session.scalar(select(User).where(User.email == "someone@example.com"))
    assert user is not None
    assert user.last_login_at is not None


async def test_login_is_case_insensitive_on_email(client: AsyncClient, make_user: MakeUser) -> None:
    await make_user("someone@example.com")
    await login(client, "  SOMEONE@example.COM ")


async def test_cookie_attributes_follow_base_path_and_security(
    settings: Settings, db_session: AsyncSession, make_user: MakeUser
) -> None:
    await make_user("someone@example.com")
    app = create_app(settings.model_copy(update={"base_path": "/wo", "cookie_secure": True}))

    async def _session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as http:
        response = await http.post(
            "/api/v1/auth/login",
            json={"email": "someone@example.com", "password": STRONG_PASSWORD},
        )
    headers = {h.split("=", 1)[0]: h for h in response.headers.get_list("set-cookie")}
    access, refresh = headers[ACCESS_COOKIE], headers[REFRESH_COOKIE]
    for header in (access, refresh):
        assert "HttpOnly" in header
        assert "Secure" in header
        assert "SameSite=strict" in header
    assert "Path=/wo;" in access
    assert "Path=/wo/api/v1/auth" in refresh


@pytest.mark.parametrize(
    ("email", "password"),
    [("someone@example.com", "Wrong-Password-1"), ("nobody@example.com", STRONG_PASSWORD)],
)
async def test_bad_credentials_get_the_same_generic_error(
    client: AsyncClient, make_user: MakeUser, email: str, password: str
) -> None:
    await make_user("someone@example.com")
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


async def test_inactive_user_cannot_login(
    client: AsyncClient, make_user: MakeUser, db_session: AsyncSession
) -> None:
    user = await make_user("someone@example.com")
    user.is_active = False
    await db_session.commit()
    response = await client.post(
        "/api/v1/auth/login", json={"email": "someone@example.com", "password": STRONG_PASSWORD}
    )
    assert response.json()["code"] == "INVALID_CREDENTIALS"


async def _fail_login(client: AsyncClient, email: str, times: int) -> None:
    for _ in range(times):
        await client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong-Pass-1"})


async def test_lockout_after_five_failures_even_with_correct_password(
    client: AsyncClient, make_user: MakeUser, clock: FrozenClock
) -> None:
    await make_user("someone@example.com")
    await _fail_login(client, "someone@example.com", 5)
    response = await client.post(
        "/api/v1/auth/login", json={"email": "someone@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 429
    assert response.json()["code"] == "TOO_MANY_LOGIN_ATTEMPTS"
    assert response.json()["params"]["retryAfterSeconds"] == 15 * 60

    clock.advance(minutes=15, seconds=1)
    await login(client, "someone@example.com")


async def test_unknown_emails_are_throttled_too(client: AsyncClient, clock: FrozenClock) -> None:
    await _fail_login(client, "ghost@example.com", 5)
    response = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 429


async def test_successful_login_resets_failure_counter(
    client: AsyncClient, make_user: MakeUser, clock: FrozenClock
) -> None:
    await make_user("someone@example.com")
    await _fail_login(client, "someone@example.com", 4)
    await login(client, "someone@example.com")
    await _fail_login(client, "someone@example.com", 4)
    await login(client, "someone@example.com")


async def test_me_requires_a_session(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH_REQUIRED"


async def test_me_returns_current_user(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "user@example.com"


async def test_access_token_expires_after_ttl(
    client: AsyncClient, make_user: MakeUser, clock: FrozenClock
) -> None:
    await make_user("someone@example.com")
    await login(client, "someone@example.com")
    clock.advance(minutes=15)
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_deactivated_user_loses_access_immediately(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await db_session.scalar(select(User).where(User.email == "user@example.com"))
    assert user is not None
    user.is_active = False
    await db_session.commit()
    assert (await user_client.get("/api/v1/auth/me")).status_code == 401


async def test_refresh_rotates_the_refresh_token(user_client: AsyncClient) -> None:
    old = user_client.cookies.get(REFRESH_COOKIE)
    response = await user_client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert response.json()["email"] == "user@example.com"
    assert user_client.cookies.get(REFRESH_COOKIE) not in (None, old)


async def test_concurrent_refresh_within_grace_is_a_soft_conflict(
    user_client: AsyncClient, clock: FrozenClock
) -> None:
    old = user_client.cookies.get(REFRESH_COOKIE)
    assert (await user_client.post("/api/v1/auth/refresh")).status_code == 200
    clock.advance(seconds=5)
    response = await user_client.post("/api/v1/auth/refresh", cookies={REFRESH_COOKIE: old or ""})
    assert response.status_code == 409
    assert response.json()["code"] == "REFRESH_TOKEN_ALREADY_ROTATED"
    # The legitimate (new) token still works.
    assert (await user_client.post("/api/v1/auth/refresh")).status_code == 200


async def test_replayed_refresh_token_revokes_the_whole_family(
    user_client: AsyncClient, clock: FrozenClock
) -> None:
    stolen = user_client.cookies.get(REFRESH_COOKIE) or ""
    assert (await user_client.post("/api/v1/auth/refresh")).status_code == 200
    current = user_client.cookies.get(REFRESH_COOKIE) or ""
    clock.advance(minutes=5)

    replay = await user_client.post("/api/v1/auth/refresh", cookies={REFRESH_COOKIE: stolen})
    assert replay.status_code == 401
    assert replay.json()["code"] == "REFRESH_TOKEN_INVALID"
    legit = await user_client.post("/api/v1/auth/refresh", cookies={REFRESH_COOKIE: current})
    assert legit.status_code == 401


async def test_refresh_without_cookie_fails_and_clears_cookies(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert response.json()["code"] == "REFRESH_TOKEN_INVALID"
    cleared = response.headers.get_list("set-cookie")
    assert any(h.startswith(f"{REFRESH_COOKIE}=") and "Max-Age=0" in h for h in cleared)


async def test_expired_refresh_token_is_rejected(
    user_client: AsyncClient, clock: FrozenClock
) -> None:
    clock.advance(days=30)
    assert (await user_client.post("/api/v1/auth/refresh")).status_code == 401


async def test_refresh_for_deactivated_user_fails(
    user_client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await db_session.scalar(select(User).where(User.email == "user@example.com"))
    assert user is not None
    user.is_active = False
    await db_session.commit()
    assert (await user_client.post("/api/v1/auth/refresh")).status_code == 401


async def test_logout_revokes_refresh_token_and_clears_cookies(user_client: AsyncClient) -> None:
    token = user_client.cookies.get(REFRESH_COOKIE) or ""
    response = await user_client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert any("Max-Age=0" in h for h in response.headers.get_list("set-cookie"))
    again = await user_client.post("/api/v1/auth/refresh", cookies={REFRESH_COOKIE: token})
    assert again.status_code == 401


async def test_logout_without_session_is_harmless(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    unknown = await client.post("/api/v1/auth/logout", cookies={REFRESH_COOKIE: "unknown"})
    assert unknown.status_code == 204
