"""Account administration (ADR-0009, P1-8)."""

import uuid
from collections.abc import Awaitable, Callable

from httpx import AsyncClient

from app.modules.auth.models import User, UserRole
from tests.conftest import STRONG_PASSWORD, login

MakeUser = Callable[..., Awaitable[User]]
NEW_USER = {
    "email": "New.Person@example.com",
    "display_name": "New Person",
    "password": STRONG_PASSWORD,
}


async def test_regular_user_cannot_administer(user_client: AsyncClient) -> None:
    response = await user_client.get("/api/v1/users")
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_admin_creates_and_lists_users(admin_client: AsyncClient) -> None:
    created = await admin_client.post("/api/v1/users", json=NEW_USER)
    assert created.status_code == 201
    assert created.json()["email"] == "new.person@example.com"
    assert created.json()["role"] == "USER"

    listing = await admin_client.get("/api/v1/users", params={"limit": 1})
    assert listing.json()["total"] == 2
    assert len(listing.json()["items"]) == 1


async def test_duplicate_email_is_rejected_case_insensitively(admin_client: AsyncClient) -> None:
    await admin_client.post("/api/v1/users", json=NEW_USER)
    duplicate = await admin_client.post(
        "/api/v1/users", json=NEW_USER | {"email": "NEW.person@EXAMPLE.com"}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "EMAIL_ALREADY_USED"


async def test_weak_password_is_rejected_on_creation(admin_client: AsyncClient) -> None:
    response = await admin_client.post("/api/v1/users", json=NEW_USER | {"password": "weak"})
    assert response.status_code == 422
    assert response.json()["code"] == "PASSWORD_TOO_SHORT"


async def test_unknown_user_returns_not_found(admin_client: AsyncClient) -> None:
    response = await admin_client.get(f"/api/v1/users/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "USER_NOT_FOUND"


async def test_admin_reads_and_updates_a_user(
    admin_client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user("someone@example.com")
    assert (await admin_client.get(f"/api/v1/users/{user.id}")).status_code == 200
    response = await admin_client.patch(
        f"/api/v1/users/{user.id}", json={"display_name": "Renamed", "role": "ADMIN"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Renamed"
    assert response.json()["role"] == "ADMIN"


async def test_deactivating_a_user_revokes_its_sessions(
    admin_client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user("someone@example.com")
    response = await admin_client.patch(f"/api/v1/users/{user.id}", json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    denied = await admin_client.post(
        "/api/v1/auth/login", json={"email": "someone@example.com", "password": STRONG_PASSWORD}
    )
    assert denied.status_code == 401


async def test_last_admin_cannot_be_demoted_or_deactivated(admin_client: AsyncClient) -> None:
    me = (await admin_client.get("/api/v1/auth/me")).json()
    for change in ({"role": "USER"}, {"is_active": False}):
        response = await admin_client.patch(f"/api/v1/users/{me['id']}", json=change)
        assert response.status_code == 409
        assert response.json()["code"] == "LAST_ADMIN"


async def test_admin_can_be_demoted_when_another_admin_exists(
    admin_client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user("second@example.com", role=UserRole.ADMIN)
    me = (await admin_client.get("/api/v1/auth/me")).json()
    response = await admin_client.patch(f"/api/v1/users/{me['id']}", json={"role": "USER"})
    assert response.status_code == 200


async def test_admin_resets_a_password(
    admin_client: AsyncClient, make_user: MakeUser, client: AsyncClient
) -> None:
    user = await make_user("someone@example.com")
    new_password = "Reset-By-Admin-9"  # noqa: S105
    response = await admin_client.post(
        f"/api/v1/users/{user.id}/reset-password", json={"new_password": new_password}
    )
    assert response.status_code == 200
    weak = await admin_client.post(
        f"/api/v1/users/{user.id}/reset-password", json={"new_password": "weak"}
    )
    assert weak.status_code == 422
    client.cookies.clear()
    await login(client, "someone@example.com", new_password)
