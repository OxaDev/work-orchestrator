"""Agenda macro (P4): half-days, RG-01/RG-02, holidays, stats, monthly locks (RG-13)."""

from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.db import get_session
from app.main import create_app
from app.modules.agenda import rules
from app.modules.auth.models import User
from tests.conftest import FrozenClock, login

MakeUser = Callable[..., Awaitable[User]]
BULK = "/api/v1/agenda/half-days/bulk"


async def _post(client: AsyncClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=body)
    assert response.status_code in (200, 201), response.text
    result: dict[str, Any] = response.json()
    return result


@pytest.fixture
async def mission_id(user_client: AsyncClient) -> str:
    client = await _post(user_client, "/api/v1/companies", {"name": "Bank"})
    esn = await _post(user_client, "/api/v1/companies", {"name": "ESN", "types": ["ESN"]})
    mission = await _post(
        user_client,
        "/api/v1/missions",
        {
            "title": "Bank — Dev",
            "job_title": "Dev",
            "client_id": client["id"],
            "employer_company_id": esn["id"],
            "start_date": "2026-01-05",
            "planned_end_date": "2026-06-30",
        },
    )
    return str(mission["id"])


def slots(*days: str, periods: tuple[str, ...] = ("AM", "PM")) -> list[dict[str, str]]:
    return [{"date": d, "period": p} for d in days for p in periods]


def weekday_slots(year: int, month: int) -> list[dict[str, str]]:
    start, end = rules.month_bounds(year, month)
    return slots(*(d.isoformat() for d in rules.days(start, end) if d.weekday() < 5))


async def _list(client: AsyncClient, start: str, end: str) -> list[dict[str, Any]]:
    response = await client.get("/api/v1/agenda/half-days", params={"from": start, "to": end})
    assert response.status_code == 200, response.text
    result: list[dict[str, Any]] = response.json()
    return result


async def test_rg01_assign_creates_then_replaces(user_client: AsyncClient, mission_id: str) -> None:
    body = {
        "slots": slots("2026-02-02"),
        "kind": "MISSION",
        "mission_id": mission_id,
        "location": "REMOTE_HOME",
    }
    created = await _post(user_client, BULK, body)
    assert created["count"] == 2
    replaced = await _post(
        user_client,
        BULK,
        {
            "slots": slots("2026-02-02", periods=("PM",)),
            "kind": "INTERCONTRACT",
            "note": " veille ",
        },
    )
    assert replaced["items"][0]["note"] == "veille"
    rows = await _list(user_client, "2026-02-01", "2026-02-28")
    assert [(r["period"], r["kind"], r["mission_id"], r["location"]) for r in rows] == [
        ("AM", "MISSION", mission_id, "REMOTE_HOME"),
        ("PM", "INTERCONTRACT", None, None),
    ]


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"kind": "MISSION"}, "HALF_DAY_MISSION_REQUIRED"),
        ({"kind": "LEAVE", "location": "REMOTE_HOME"}, "LOCATION_NOT_ALLOWED"),
        ({"kind": "MISSION", "mission": True, "date": "2026-07-01"}, "MISSION_DATE_OUT_OF_RANGE"),
        ({"kind": "LEAVE", "mission": True}, "HALF_DAY_MISSION_NOT_ALLOWED"),
    ],
)
async def test_rg02_violations_write_nothing(
    user_client: AsyncClient, mission_id: str, body: dict[str, Any], code: str
) -> None:
    payload: dict[str, Any] = {
        "kind": body["kind"],
        "slots": slots("2026-02-03", body.get("date", "2026-02-04")),
    }
    if body.get("mission"):
        payload["mission_id"] = mission_id
    if "location" in body:
        payload["location"] = body["location"]
    response = await user_client.post(BULK, json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == code
    assert await _list(user_client, "2026-01-01", "2026-12-31") == []


async def test_subtypes(user_client: AsyncClient) -> None:
    leave = await _post(
        user_client,
        "/api/v1/agenda/subtypes",
        {"kind": "LEAVE", "name_fr": "CP", "name_en": "Paid leave"},
    )
    await _post(
        user_client,
        "/api/v1/agenda/subtypes",
        {"kind": "SICK_LEAVE", "name_fr": "CP", "name_en": "same name, other kind"},
    )
    duplicate = await user_client.post(
        "/api/v1/agenda/subtypes", json={"kind": "LEAVE", "name_fr": " cp", "name_en": "x"}
    )
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"

    mismatch = await user_client.post(
        BULK, json={"slots": slots("2026-02-05"), "kind": "OFF", "subtype_id": leave["id"]}
    )
    assert mismatch.json()["code"] == "SUBTYPE_KIND_MISMATCH"
    await _post(
        user_client,
        BULK,
        {"slots": slots("2026-02-05"), "kind": "LEAVE", "subtype_id": leave["id"]},
    )

    listed = {s["id"]: s for s in (await user_client.get("/api/v1/agenda/subtypes")).json()}
    assert listed[leave["id"]]["usage"] == 2
    renamed = await user_client.patch(
        f"/api/v1/agenda/subtypes/{leave['id']}", json={"name_fr": "Congés payés", "name_en": "PTO"}
    )
    assert renamed.json()["name_fr"] == "Congés payés"
    used = await user_client.delete(f"/api/v1/agenda/subtypes/{leave['id']}")
    assert used.json()["params"] == {"entity": "halfDaySubtype", "referencedBy": "halfDay"}

    await user_client.post(
        "/api/v1/agenda/half-days/bulk-delete", json={"slots": slots("2026-02-05")}
    )
    assert (await user_client.delete(f"/api/v1/agenda/subtypes/{leave['id']}")).status_code == 204
    assert (
        await user_client.patch(f"/api/v1/agenda/subtypes/{leave['id']}", json={})
    ).status_code == 404


async def test_single_put_delete_and_ranges(user_client: AsyncClient) -> None:
    put = await user_client.put(
        "/api/v1/agenda/half-days/2026-03-02/AM",
        json={"kind": "TRAINING", "location": "TRAVEL_ESN"},
    )
    assert put.json()["kind"] == "TRAINING"
    assert len(await _list(user_client, "2026-03-02", "2026-03-02")) == 1
    assert (await user_client.delete("/api/v1/agenda/half-days/2026-03-02/AM")).status_code == 204
    assert await _list(user_client, "2026-03-01", "2026-03-31") == []

    too_large = await user_client.get(
        "/api/v1/agenda/half-days", params={"from": "2026-01-01", "to": "2027-06-01"}
    )
    assert too_large.json()["code"] == "RANGE_TOO_LARGE"
    reversed_range = await user_client.get(
        "/api/v1/agenda/half-days", params={"from": "2026-02-01", "to": "2026-01-01"}
    )
    assert reversed_range.json()["code"] == "INVALID_DATE_RANGE"


async def test_public_holidays_generation_is_once_per_year(user_client: AsyncClient) -> None:
    listed = (await user_client.get("/api/v1/agenda/public-holidays", params={"year": 2026})).json()
    assert len(listed) == 11
    assert listed[0] == {"date": "2026-01-01", "name": "Jour de l'an"}

    first = await _post(user_client, "/api/v1/agenda/public-holidays/generate?year=2026", {})
    assert first == {"created": 22, "skipped_locked": 0, "already_generated": False}
    rows = await _list(user_client, "2026-07-14", "2026-07-14")
    assert {(r["kind"], r["note"]) for r in rows} == {("PUBLIC_HOLIDAY", "Fête nationale")}

    # Worked on Bastille Day: the change is kept, generation does not come back.
    await _post(user_client, BULK, {"slots": slots("2026-07-14"), "kind": "INTERCONTRACT"})
    again = await _post(user_client, "/api/v1/agenda/public-holidays/generate?year=2026", {})
    assert again["already_generated"] is True
    forced = await _post(
        user_client, "/api/v1/agenda/public-holidays/generate?year=2026&force=true", {}
    )
    assert forced["created"] == 0  # filled half-days are never overwritten
    assert (await _list(user_client, "2026-07-14", "2026-07-14"))[0]["kind"] == "INTERCONTRACT"


async def test_holiday_region_from_profile(user_client: AsyncClient) -> None:
    profile = await user_client.patch("/api/v1/me", json={"holiday_subdivision": "57"})
    assert profile.json()["holiday_subdivision"] == "57"
    listed = (await user_client.get("/api/v1/agenda/public-holidays", params={"year": 2026})).json()
    assert "2026-12-26" in {h["date"] for h in listed}
    invalid = await user_client.patch("/api/v1/me", json={"holiday_subdivision": "99"})
    assert invalid.status_code == 422
    cleared = await user_client.patch("/api/v1/me", json={"holiday_subdivision": None})
    assert cleared.json()["holiday_subdivision"] is None


async def test_stats(user_client: AsyncClient, mission_id: str) -> None:
    await _post(
        user_client,
        BULK,
        {
            "slots": slots("2026-02-02", "2026-02-03"),
            "kind": "MISSION",
            "mission_id": mission_id,
            "location": "CLIENT_ON_SITE",
        },
    )
    await _post(user_client, BULK, {"slots": slots("2026-02-04", periods=("AM",)), "kind": "LEAVE"})
    stats = (
        await user_client.get(
            "/api/v1/agenda/stats", params={"from": "2026-02-01", "to": "2026-02-28"}
        )
    ).json()
    assert stats["working_days"] == 20
    assert stats["filled_days"] == 2.5
    assert stats["by_kind"] == [{"kind": "LEAVE", "days": 0.5}, {"kind": "MISSION", "days": 2.0}]
    assert stats["by_mission"] == [
        {
            "mission": {"id": mission_id, "name": "Bank — Dev"},
            "color": stats["by_mission"][0]["color"],
            "days": 2.0,
        }
    ]
    assert stats["by_location"] == [{"location": "CLIENT_ON_SITE", "days": 2.0}]
    assert stats["unfilled_count"] == 40 - 5


async def test_rg13_monthly_lock(user_client: AsyncClient) -> None:
    month = "/api/v1/agenda/months/2026/2"
    incomplete = await user_client.post(f"{month}/lock", json={})
    assert incomplete.status_code == 422
    assert incomplete.json()["code"] == "MONTH_INCOMPLETE"
    assert incomplete.json()["params"]["count"] == 40
    assert len(incomplete.json()["params"]["missing"]) == 20

    await _post(user_client, BULK, {"slots": weekday_slots(2026, 2), "kind": "INTERCONTRACT"})
    locked = await _post(user_client, f"{month}/lock", {"note": "CRA envoyé"})
    assert locked["locked"] is True
    assert locked["note"] == "CRA envoyé"
    assert locked["missing"] == []
    assert locked["stats"]["by_kind"] == [{"kind": "INTERCONTRACT", "days": 20.0}]
    assert (await _post(user_client, f"{month}/lock", {}))["locked"] is True  # idempotent

    for url, body in (
        (BULK, {"slots": slots("2026-02-10"), "kind": "LEAVE"}),
        ("/api/v1/agenda/half-days/bulk-delete", {"slots": slots("2026-02-10")}),
        (BULK, {"slots": [*slots("2026-03-02"), *slots("2026-02-27")], "kind": "LEAVE"}),
    ):
        blocked = await user_client.post(url, json=body)
        assert blocked.status_code == 409
        assert blocked.json() == {
            "code": "MONTH_LOCKED",
            "detail": "MONTH_LOCKED",
            "params": {"months": ["2026-02"]},
        }
    assert (
        await user_client.put("/api/v1/agenda/half-days/2026-02-10/AM", json={"kind": "OFF"})
    ).status_code == 409

    months = (await user_client.get("/api/v1/agenda/months", params={"year": 2026})).json()
    assert [m["month"] for m in months if m["locked"]] == [2]

    short = await user_client.post(f"{month}/unlock", json={"reason": "x"})
    assert short.status_code == 422
    unlocked = await _post(
        user_client, f"{month}/unlock", {"reason": "Oubli d'une demi-journée de congé"}
    )
    assert unlocked["locked"] is False
    assert [e["action"] for e in unlocked["events"]] == ["UNLOCK", "LOCK"]
    assert unlocked["events"][0]["reason"] == "Oubli d'une demi-journée de congé"
    await _post(user_client, BULK, {"slots": slots("2026-02-10"), "kind": "LEAVE"})
    not_locked = await user_client.post(f"{month}/unlock", json={"reason": "again"})
    assert not_locked.json()["code"] == "MONTH_NOT_LOCKED"


async def test_holiday_generation_skips_locked_months(user_client: AsyncClient) -> None:
    await _post(user_client, BULK, {"slots": weekday_slots(2026, 5), "kind": "INTERCONTRACT"})
    await _post(user_client, "/api/v1/agenda/months/2026/5/lock", {})
    result = await _post(user_client, "/api/v1/agenda/public-holidays/generate?year=2026", {})
    assert result["skipped_locked"] == 8  # 1st, 8th, 14th and 25th of May, AM and PM
    assert result["created"] == 22 - 8


async def test_unfilled_since_first_use(user_client: AsyncClient, clock: FrozenClock) -> None:
    today = clock.now.date()
    assert (await user_client.get("/api/v1/agenda/unfilled")).json()["count"] >= 0
    clock.advance(days=21)
    await login(user_client, "user@example.com")  # the access token expired meanwhile
    unfilled = (await user_client.get("/api/v1/agenda/unfilled")).json()
    assert "since" in unfilled, unfilled
    assert unfilled["since"] == today.replace(day=1).isoformat()
    assert unfilled["until"] == (clock.now.date() - timedelta(days=1)).isoformat()
    expected = rules.expected_slots(
        date.fromisoformat(unfilled["since"]), date.fromisoformat(unfilled["until"]), None
    )
    assert unfilled["count"] == len(expected)
    assert len(unfilled["slots"]) == min(31, len(expected))


async def test_mission_rules_with_agenda_history(user_client: AsyncClient, mission_id: str) -> None:
    await _post(
        user_client,
        BULK,
        {"slots": slots("2026-06-29"), "kind": "MISSION", "mission_id": mission_id},
    )
    shorten = await user_client.patch(
        f"/api/v1/missions/{mission_id}", json={"planned_end_date": "2026-05-31"}
    )
    assert shorten.status_code == 409
    assert shorten.json()["params"] == {"count": 2, "firstDate": "2026-06-29"}
    later_start = await user_client.patch(
        f"/api/v1/missions/{mission_id}",
        json={"start_date": "2026-07-01", "planned_end_date": "2026-12-31"},
    )
    assert later_start.json()["code"] == "MISSION_HAS_HALF_DAYS_OUTSIDE"
    extend = await user_client.patch(
        f"/api/v1/missions/{mission_id}", json={"planned_end_date": "2026-09-30"}
    )
    assert extend.status_code == 200

    # RG-12: a mission with agenda history cannot be deleted, only archived.
    delete = await user_client.delete(f"/api/v1/missions/{mission_id}")
    assert delete.status_code == 409
    assert delete.json()["params"] == {"entity": "mission", "referencedBy": "agenda"}
    assert (await user_client.get(f"/api/v1/missions/{mission_id}")).status_code == 200


@pytest.fixture
async def other_client(
    settings: Settings, db_session: AsyncSession, make_user: MakeUser
) -> AsyncIterator[AsyncClient]:
    await make_user("other@example.com")
    app = create_app(settings)

    async def _session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http:
        await login(http, "other@example.com")
        yield http


async def test_agenda_is_private(
    user_client: AsyncClient, other_client: AsyncClient, mission_id: str
) -> None:
    """ADR-0010: other users see nothing and cannot use someone else's mission."""
    await _post(user_client, BULK, {"slots": weekday_slots(2026, 2), "kind": "INTERCONTRACT"})
    await _post(user_client, "/api/v1/agenda/months/2026/2/lock", {})
    assert await _list(other_client, "2026-02-01", "2026-02-28") == []
    stolen = await other_client.post(
        BULK, json={"slots": slots("2026-02-02"), "kind": "MISSION", "mission_id": mission_id}
    )
    assert stolen.status_code == 404
    # The other user's February is neither locked nor blocked by the first user's lock.
    own = await other_client.post(BULK, json={"slots": slots("2026-02-02"), "kind": "LEAVE"})
    assert own.status_code == 200
    status_ = (await other_client.get("/api/v1/agenda/months/2026/2")).json()
    assert status_["locked"] is False
