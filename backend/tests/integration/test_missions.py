"""Missions (P3-1 to P3-5): creation rules, ownership, filters, links, history."""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.db import get_session
from app.main import create_app
from app.modules.auth.models import User
from tests.conftest import FrozenClock, login

MakeUser = Callable[..., Awaitable[User]]


async def _post(client: AsyncClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


@pytest.fixture
async def refs(user_client: AsyncClient) -> dict[str, str]:
    """Client, ESN (set as the user's employer), a contact, a technology and a role."""
    client = await _post(user_client, "/api/v1/companies", {"name": "Banque Horizon"})
    other = await _post(user_client, "/api/v1/companies", {"name": "Atlas"})
    esn = await _post(user_client, "/api/v1/companies", {"name": "Néo", "types": ["ESN"]})
    await user_client.patch("/api/v1/me", json={"employer_company_id": esn["id"]})
    contact = await _post(
        user_client, "/api/v1/contacts", {"first_name": "Inès", "last_name": "Moreau"}
    )
    tech = await _post(
        user_client, "/api/v1/technologies", {"name": "Kafka", "category": "MESSAGING"}
    )
    role = await _post(
        user_client, "/api/v1/contact-roles", {"name_fr": "Manager", "name_en": "Manager"}
    )
    return {
        "client": client["id"],
        "other": other["id"],
        "esn": esn["id"],
        "contact": contact["id"],
        "tech": tech["id"],
        "role": role["id"],
    }


def _mission_body(refs: dict[str, str], **extra: Any) -> dict[str, Any]:
    return {
        "title": "Horizon — Paiements",
        "job_title": "Tech lead",
        "client_id": refs["client"],
        "start_date": "2026-01-05",
        "planned_end_date": "2026-12-31",
        **extra,
    }


async def test_create_mission_uses_profile_employer_and_picks_colours(
    user_client: AsyncClient, refs: dict[str, str]
) -> None:
    first = await _post(user_client, "/api/v1/missions", _mission_body(refs, location=" Paris "))
    assert first["employer"] == {"id": refs["esn"], "name": "Néo"}
    assert first["client"]["name"] == "Banque Horizon"
    assert first["location"] == "Paris"
    assert first["status"] == "ACTIVE"
    assert first["contacts"] == []
    assert first["technologies"] == []
    second = await _post(user_client, "/api/v1/missions", _mission_body(refs, title="Second"))
    assert first["color"] != second["color"]
    chosen = await _post(
        user_client, "/api/v1/missions", _mission_body(refs, title="Third", color="red")
    )
    assert chosen["color"] == "red"


async def test_employer_is_required_when_profile_has_none(
    user_client: AsyncClient, refs: dict[str, str]
) -> None:
    await user_client.patch("/api/v1/me", json={"employer_company_id": None})
    response = await user_client.post("/api/v1/missions", json=_mission_body(refs))
    assert response.status_code == 422
    assert response.json()["code"] == "MISSION_EMPLOYER_REQUIRED"
    explicit = await _post(
        user_client, "/api/v1/missions", _mission_body(refs, employer_company_id=refs["other"])
    )
    assert explicit["employer"]["id"] == refs["other"]


@pytest.mark.parametrize(
    "extra",
    [
        {"planned_end_date": "2025-12-31"},
        {"actual_end_date": "2025-12-31"},
    ],
)
async def test_end_dates_cannot_precede_start(
    user_client: AsyncClient, refs: dict[str, str], extra: dict[str, str]
) -> None:
    response = await user_client.post("/api/v1/missions", json=_mission_body(refs, **extra))
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_DATE_RANGE"


async def test_unknown_client_or_employer(user_client: AsyncClient, refs: dict[str, str]) -> None:
    for body in (
        _mission_body(refs, client_id=str(uuid.uuid4())),
        _mission_body(refs, employer_company_id=str(uuid.uuid4())),
    ):
        response = await user_client.post("/api/v1/missions", json=body)
        assert response.status_code == 404
        assert response.json()["params"] == {"entity": "company"}


async def test_update_tracks_end_date_changes(
    user_client: AsyncClient, refs: dict[str, str], clock: FrozenClock
) -> None:
    mission = await _post(user_client, "/api/v1/missions", _mission_body(refs))
    url = f"/api/v1/missions/{mission['id']}"
    renewed = await user_client.patch(
        url, json={"planned_end_date": "2027-06-30", "end_date_change_note": "Avenant n°1"}
    )
    body = renewed.json()
    assert body["planned_end_date"] == "2027-06-30"
    assert [(c["old_date"], c["new_date"], c["note"]) for c in body["end_date_changes"]] == [
        ("2026-12-31", "2027-06-30", "Avenant n°1")
    ]

    unchanged = await user_client.patch(
        url, json={"title": "Renamed", "planned_end_date": "2027-06-30"}
    )
    assert len(unchanged.json()["end_date_changes"]) == 1
    assert unchanged.json()["title"] == "Renamed"

    too_late_start = await user_client.patch(url, json={"start_date": "2028-01-01"})
    assert too_late_start.json()["code"] == "INVALID_DATE_RANGE"

    full = await user_client.patch(
        url,
        json={
            "job_title": "Architecte",
            "client_id": refs["other"],
            "employer_company_id": refs["esn"],
            "status": "ON_HOLD",
            "location": None,
            "remote_policy": "2 j/semaine",
            "objectives": "- Kafka",
            "description": "d",
            "review": "r",
            "color": "grape",
            "daily_rate": "650.50",
            "actual_end_date": "2027-03-31",
        },
    )
    data = full.json()
    assert data["client"]["name"] == "Atlas"
    assert data["status"] == "ON_HOLD"
    assert data["location"] is None
    assert data["daily_rate"] == "650.50"
    assert data["actual_end_date"] == "2027-03-31"


async def test_suggested_status_is_exposed(
    user_client: AsyncClient, refs: dict[str, str], clock: FrozenClock
) -> None:
    ended = await _post(
        user_client,
        "/api/v1/missions",
        _mission_body(refs, start_date="2020-01-01", planned_end_date="2020-12-31"),
    )
    assert ended["suggested_status"] == "ENDED"


async def test_filters(user_client: AsyncClient, refs: dict[str, str]) -> None:
    await _post(user_client, "/api/v1/missions", _mission_body(refs, title="Running"))
    await _post(
        user_client,
        "/api/v1/missions",
        _mission_body(
            refs,
            title="Old",
            start_date="2020-01-01",
            planned_end_date="2020-06-30",
            status="ENDED",
        ),
    )
    await _post(
        user_client,
        "/api/v1/missions",
        _mission_body(
            refs,
            title="Atlas audit",
            client_id=refs["other"],
            start_date="2027-01-01",
            planned_end_date=None,
            status="PROSPECT",
        ),
    )

    async def titles(**params: Any) -> list[str]:
        response = await user_client.get("/api/v1/missions", params=params)
        return [m["title"] for m in response.json()["items"]]

    assert await titles() == ["Atlas audit", "Running", "Old"]
    assert await titles(status="ENDED") == ["Old"]
    assert await titles(client_id=refs["other"]) == ["Atlas audit"]
    assert await titles(active_on="2026-06-01") == ["Running"]
    assert await titles(active_on="2027-02-01") == ["Atlas audit"]
    assert await titles(**{"from": "2020-03-01", "to": "2020-04-01"}) == ["Old"]
    assert await titles(q="atlas") == ["Atlas audit"]
    assert await titles(q="horizon") == ["Running", "Old"]
    assert await titles(q="runn") == ["Running"]


async def test_contacts_and_technologies(user_client: AsyncClient, refs: dict[str, str]) -> None:
    mission = await _post(user_client, "/api/v1/missions", _mission_body(refs))
    base = f"/api/v1/missions/{mission['id']}"

    added = await user_client.put(
        f"{base}/contacts/{refs['contact']}", json={"role_id": refs["role"], "note": " clé "}
    )
    contact = added.json()["contacts"][0]
    assert contact["contact"]["name"] == "Inès Moreau"
    assert contact["role"]["name_fr"] == "Manager"
    assert contact["note"] == "clé"
    updated = await user_client.put(f"{base}/contacts/{refs['contact']}", json={})
    assert updated.json()["contacts"][0]["role"] is None
    assert len(updated.json()["contacts"]) == 1

    unknown_role = await user_client.put(
        f"{base}/contacts/{refs['contact']}", json={"role_id": str(uuid.uuid4())}
    )
    assert unknown_role.json()["params"] == {"entity": "contactRole"}
    unknown_contact = await user_client.put(f"{base}/contacts/{uuid.uuid4()}", json={})
    assert unknown_contact.json()["params"] == {"entity": "contact"}

    tech = await user_client.put(
        f"{base}/technologies/{refs['tech']}", json={"weight": 4, "version": "3.7"}
    )
    assert tech.json()["technologies"] == [
        {
            "technology": {"id": refs["tech"], "name": "Kafka"},
            "category": "MESSAGING",
            "weight": 4,
            "version": "3.7",
            "note": None,
        }
    ]
    reweighted = await user_client.put(f"{base}/technologies/{refs['tech']}", json={"weight": 5})
    assert reweighted.json()["technologies"][0]["weight"] == 5
    assert reweighted.json()["technologies"][0]["version"] is None
    out_of_range = await user_client.put(f"{base}/technologies/{refs['tech']}", json={"weight": 6})
    assert out_of_range.status_code == 422

    assert (await user_client.delete(f"{base}/contacts/{refs['contact']}")).json()["contacts"] == []
    assert (await user_client.delete(f"{base}/technologies/{refs['tech']}")).json()[
        "technologies"
    ] == []
    assert (await user_client.delete(f"{base}/contacts/{refs['contact']}")).status_code == 404
    assert (await user_client.delete(f"{base}/technologies/{refs['tech']}")).status_code == 404


async def test_archive_restore_and_delete(user_client: AsyncClient, refs: dict[str, str]) -> None:
    mission = await _post(user_client, "/api/v1/missions", _mission_body(refs))
    base = f"/api/v1/missions/{mission['id']}"
    await user_client.put(f"{base}/technologies/{refs['tech']}", json={"weight": 3})
    assert (await user_client.post(f"{base}/archive")).json()["archived_at"] is not None
    assert (await user_client.get("/api/v1/missions")).json()["total"] == 0
    assert (await user_client.get("/api/v1/missions", params={"include_archived": True})).json()[
        "total"
    ] == 1
    assert (await user_client.post(f"{base}/restore")).json()["archived_at"] is None
    assert (await user_client.delete(base)).status_code == 204
    assert (await user_client.get(base)).status_code == 404


@pytest.fixture
async def other_client(
    settings: Settings, db_session: AsyncSession, make_user: MakeUser
) -> AsyncIterator[AsyncClient]:
    """A second signed-in user sharing the same database transaction."""
    await make_user("other@example.com")
    app = create_app(settings)

    async def _session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http:
        await login(http, "other@example.com")
        yield http


async def test_missions_are_private_to_their_owner(
    user_client: AsyncClient, other_client: AsyncClient, refs: dict[str, str]
) -> None:
    """ADR-0010: another user sees nothing and gets 404 on every operation."""
    mission = await _post(user_client, "/api/v1/missions", _mission_body(refs))
    base = f"/api/v1/missions/{mission['id']}"
    assert (await other_client.get("/api/v1/missions")).json()["total"] == 0
    for method, url, body in (
        ("GET", base, None),
        ("PATCH", base, {"title": "stolen"}),
        ("POST", f"{base}/archive", None),
        ("DELETE", base, None),
        ("PUT", f"{base}/contacts/{refs['contact']}", {}),
        ("PUT", f"{base}/technologies/{refs['tech']}", {"weight": 1}),
    ):
        response = await other_client.request(method, url, json=body)
        assert response.status_code == 404, (method, url)
        assert response.json()["params"] == {"entity": "mission"}
    assert (await user_client.get(base)).json()["title"] == "Horizon — Paiements"


async def test_contact_roles(user_client: AsyncClient, refs: dict[str, str]) -> None:
    roles = (await user_client.get("/api/v1/contact-roles")).json()
    assert roles == [{"id": refs["role"], "name_fr": "Manager", "name_en": "Manager", "usage": 0}]
    duplicate = await user_client.post(
        "/api/v1/contact-roles", json={"name_fr": " manager", "name_en": "x"}
    )
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"
    renamed = await user_client.patch(
        f"/api/v1/contact-roles/{refs['role']}",
        json={"name_en": "Line manager", "name_fr": "Responsable"},
    )
    assert renamed.json()["name_en"] == "Line manager"

    mission = await _post(user_client, "/api/v1/missions", _mission_body(refs))
    await user_client.put(
        f"/api/v1/missions/{mission['id']}/contacts/{refs['contact']}",
        json={"role_id": refs["role"]},
    )
    used = await user_client.delete(f"/api/v1/contact-roles/{refs['role']}")
    assert used.json()["params"] == {"entity": "contactRole", "referencedBy": "missionContact"}
    assert (await user_client.get("/api/v1/contact-roles")).json()[0]["usage"] == 1

    spare = await _post(user_client, "/api/v1/contact-roles", {"name_fr": "RH", "name_en": "HR"})
    assert (await user_client.delete(f"/api/v1/contact-roles/{spare['id']}")).status_code == 204
    assert (
        await user_client.patch(f"/api/v1/contact-roles/{spare['id']}", json={})
    ).status_code == 404
