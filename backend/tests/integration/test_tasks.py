"""Tasks, daily logs and standup (P5, ADR-0020, ADR-0021, ADR-0034): RG-03 to RG-06, RG-13."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_agenda import slots, weekday_slots
from tests.integration.test_subjects import create_mission, post, subject

TASKS = "/api/v1/agenda/tasks"
BULK = "/api/v1/agenda/half-days/bulk"
MONDAY = "2026-03-02"


@pytest.fixture
async def mission_id(user_client: AsyncClient) -> str:
    return await create_mission(user_client)


@pytest.fixture
async def subjects(user_client: AsyncClient, mission_id: str) -> dict[str, str]:
    """One subject per scope."""
    return {
        "MISSION": (await subject(user_client, "SSO", scope="MISSION", mission_id=mission_id))[
            "id"
        ],
        "INTERCONTRACT": (await subject(user_client, "Veille"))["id"],
        "TRAINING": (await subject(user_client, "AWS", scope="TRAINING"))["id"],
        "PERSONAL": (await subject(user_client, "Admin", scope="PERSONAL"))["id"],
    }


async def fill(client: AsyncClient, kind: str, *days: str, **values: Any) -> None:
    await post(client, BULK, {"slots": slots(*days), "kind": kind, **values})


async def task(
    client: AsyncClient,
    subject_id: str,
    day: str = MONDAY,
    period: str = "AM",
    status: int = 201,
    **fields: Any,
) -> dict[str, Any]:
    body = {
        "date": day,
        "period": period,
        "subject_id": subject_id,
        "title": "Work",
        "duration_minutes": 60,
        **fields,
    }
    response = await client.post(TASKS, json=body)
    assert response.status_code == status, response.text
    result: dict[str, Any] = response.json()
    return result


async def half_day(client: AsyncClient, day: str, period: str) -> dict[str, Any] | None:
    rows = (await client.get("/api/v1/agenda/half-days", params={"from": day, "to": day})).json()
    return next((row for row in rows if row["period"] == period), None)


async def test_task_in_a_compatible_half_day(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    await fill(user_client, "MISSION", MONDAY, mission_id=mission_id)
    created = await task(
        user_client,
        subjects["MISSION"],
        title=" Revue Keycloak ",
        starts_at="09:30:00",
        duration_minutes=90,
        external_ref=" SSO-12 ",
        description="**notes**",
    )
    assert created["warnings"] == []
    read = created["task"]
    assert (read["date"], read["period"], read["status"]) == (MONDAY, "AM", "PLANNED")
    assert read["subject"] == {
        "id": subjects["MISSION"],
        "title": "SSO",
        "scope": "MISSION",
        "mission_id": mission_id,
    }
    assert (read["title"], read["starts_at"], read["external_ref"]) == (
        "Revue Keycloak",
        "09:30:00",
        "SSO-12",
    )
    listed = (await user_client.get(TASKS, params={"from": MONDAY, "to": MONDAY})).json()
    assert [t["id"] for t in listed] == [read["id"]]
    by_subject = await user_client.get(
        TASKS, params={"from": MONDAY, "to": MONDAY, "subject_id": subjects["INTERCONTRACT"]}
    )
    assert by_subject.json() == []

    await user_client.patch(f"{TASKS}/{read['id']}", json={"status": "DONE"})
    sso = (await user_client.get(f"/api/v1/subjects/{subjects['MISSION']}")).json()
    assert (sso["task_count"], sso["done_minutes"]) == (1, 90)


async def test_rg03_intercontract_task_refused_in_mission_half_day(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    await fill(user_client, "MISSION", MONDAY, mission_id=mission_id)
    refused = await task(user_client, subjects["INTERCONTRACT"], status=409)
    assert refused["code"] == "TASK_INCOMPATIBLE_HALF_DAY"
    assert refused["params"] == {"halfDayKind": "MISSION", "subjectScope": "INTERCONTRACT"}


async def test_rg04_mission_tasks_only_in_their_own_mission(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    other = await create_mission(user_client, "Insurer")
    await fill(user_client, "MISSION", MONDAY, mission_id=other)
    assert (await task(user_client, subjects["MISSION"], status=409))["params"] == {
        "halfDayKind": "MISSION",
        "subjectScope": "MISSION",
    }
    await fill(user_client, "INTERCONTRACT", "2026-03-03")
    await task(user_client, subjects["MISSION"], "2026-03-03", status=409)
    # Intercontract half-days accept intercontract, training and personal subjects.
    for scope in ("INTERCONTRACT", "TRAINING", "PERSONAL"):
        await task(user_client, subjects[scope], "2026-03-03")
    await fill(user_client, "TRAINING", "2026-03-04")
    await task(user_client, subjects["TRAINING"], "2026-03-04")
    await task(user_client, subjects["PERSONAL"], "2026-03-04", status=409)


async def test_rg05_absences_hold_no_task(
    user_client: AsyncClient, subjects: dict[str, str]
) -> None:
    for kind in ("LEAVE", "PUBLIC_HOLIDAY", "SICK_LEAVE", "OFF"):
        await fill(user_client, kind, MONDAY)
        for subject_id in subjects.values():
            await task(user_client, subject_id, status=409)


async def test_empty_slot_gets_the_subject_natural_kind(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    await task(user_client, subjects["MISSION"], MONDAY, "AM")
    mission_half_day = await half_day(user_client, MONDAY, "AM")
    assert mission_half_day is not None
    assert (mission_half_day["kind"], mission_half_day["mission_id"]) == ("MISSION", mission_id)
    await task(user_client, subjects["INTERCONTRACT"], MONDAY, "PM")
    assert (await half_day(user_client, MONDAY, "PM") or {})["kind"] == "INTERCONTRACT"
    await task(user_client, subjects["TRAINING"], "2026-03-03", "AM")
    assert (await half_day(user_client, "2026-03-03", "AM") or {})["kind"] == "TRAINING"

    personal = await task(user_client, subjects["PERSONAL"], "2026-03-03", "PM", status=422)
    assert personal["code"] == "HALF_DAY_EMPTY"
    # RG-02 still applies: no mission half-day outside the mission period.
    outside = await task(user_client, subjects["MISSION"], "2027-01-04", status=422)
    assert outside["code"] == "MISSION_DATE_OUT_OF_RANGE"
    assert await half_day(user_client, "2027-01-04", "AM") is None


async def test_rg06_overbooked_half_day_is_a_warning(
    user_client: AsyncClient, subjects: dict[str, str]
) -> None:
    first = await task(user_client, subjects["INTERCONTRACT"], duration_minutes=180)
    assert first["warnings"] == []
    second = await task(user_client, subjects["INTERCONTRACT"], duration_minutes=90)
    assert second["warnings"] == [
        {
            "code": "HALF_DAY_OVERBOOKED",
            "params": {"date": MONDAY, "period": "AM", "totalMinutes": 270, "maxMinutes": 240},
        }
    ]
    # Cancelled time does not count.
    fixed = await user_client.patch(f"{TASKS}/{second['task']['id']}", json={"status": "CANCELLED"})
    assert fixed.json()["warnings"] == []


async def test_half_day_changes_respect_their_tasks(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    created = await task(user_client, subjects["MISSION"])
    change = await user_client.post(
        BULK, json={"slots": slots(MONDAY, periods=("AM",)), "kind": "INTERCONTRACT"}
    )
    assert change.status_code == 409
    assert change.json()["code"] == "HALF_DAY_HAS_INCOMPATIBLE_TASKS"
    assert change.json()["params"]["count"] == 1
    assert change.json()["params"]["tasks"][0]["id"] == created["task"]["id"]
    # Same kind and mission, other location: fine.
    relocate = await user_client.post(
        BULK,
        json={
            "slots": slots(MONDAY, periods=("AM",)),
            "kind": "MISSION",
            "mission_id": mission_id,
            "location": "REMOTE_HOME",
        },
    )
    assert relocate.status_code == 200
    clear = await user_client.post(
        "/api/v1/agenda/half-days/bulk-delete", json={"slots": slots(MONDAY)}
    )
    assert clear.status_code == 409
    assert clear.json()["code"] == "HALF_DAY_HAS_TASKS"


async def test_subject_rules_once_tasks_exist(
    user_client: AsyncClient, subjects: dict[str, str]
) -> None:
    await task(user_client, subjects["INTERCONTRACT"])
    scope = await user_client.patch(
        f"/api/v1/subjects/{subjects['INTERCONTRACT']}", json={"scope": "PERSONAL"}
    )
    assert scope.status_code == 409
    assert scope.json()["code"] == "SUBJECT_HAS_TASKS"
    delete = await user_client.delete(f"/api/v1/subjects/{subjects['INTERCONTRACT']}")
    assert delete.json()["params"] == {"entity": "subject", "referencedBy": "task"}
    await user_client.post(f"/api/v1/subjects/{subjects['INTERCONTRACT']}/archive")
    archived = await task(user_client, subjects["INTERCONTRACT"], status=422)
    assert archived["code"] == "SUBJECT_ARCHIVED"


async def test_move_and_edit_a_task(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    created = (await task(user_client, subjects["INTERCONTRACT"], starts_at="10:00:00"))["task"]
    url = f"{TASKS}/{created['id']}"
    moved = await user_client.patch(url, json={"date": "2026-03-03", "period": "PM"})
    assert moved.status_code == 200, moved.text
    assert (moved.json()["task"]["date"], moved.json()["task"]["period"]) == ("2026-03-03", "PM")
    period_only = await user_client.patch(url, json={"period": "AM"})
    assert period_only.json()["task"]["date"] == "2026-03-03"

    await fill(user_client, "MISSION", "2026-03-05", mission_id=mission_id)
    refused = await user_client.patch(url, json={"date": "2026-03-05"})
    assert refused.json()["code"] == "TASK_INCOMPATIBLE_HALF_DAY"
    resubject = await user_client.patch(url, json={"subject_id": subjects["MISSION"]})
    assert resubject.json()["code"] == "TASK_INCOMPATIBLE_HALF_DAY"
    both = await user_client.patch(
        url, json={"date": "2026-03-05", "subject_id": subjects["MISSION"]}
    )
    assert both.json()["task"]["subject"]["id"] == subjects["MISSION"]

    edited = await user_client.patch(
        url,
        json={
            "title": "Revue",
            "starts_at": None,
            "duration_minutes": 30,
            "external_ref": "",
            "description": "ok",
        },
    )
    body = edited.json()["task"]
    assert (body["title"], body["starts_at"], body["duration_minutes"]) == ("Revue", None, 30)
    assert (body["external_ref"], body["description"]) == (None, "ok")
    too_long = await user_client.patch(url, json={"duration_minutes": 721})
    assert too_long.status_code == 422
    assert (await user_client.delete(url)).status_code == 204
    assert (await user_client.patch(url, json={"title": "x"})).status_code == 404


async def test_meeting_participants(user_client: AsyncClient, subjects: dict[str, str]) -> None:
    alice = await post(user_client, "/api/v1/contacts", {"first_name": "Alice", "last_name": "B"})
    bob = await post(user_client, "/api/v1/contacts", {"first_name": "Bob", "last_name": "A"})
    not_meeting = await task(
        user_client, subjects["INTERCONTRACT"], status=422, participant_ids=[alice["id"]]
    )
    assert not_meeting["code"] == "TASK_PARTICIPANTS_MEETING_ONLY"
    meeting = (
        await task(
            user_client,
            subjects["INTERCONTRACT"],
            kind="MEETING",
            participant_ids=[alice["id"], bob["id"], alice["id"]],
        )
    )["task"]
    assert [p["name"] for p in meeting["participants"]] == ["Bob A", "Alice B"]
    url = f"{TASKS}/{meeting['id']}"
    only_bob = await user_client.patch(url, json={"participant_ids": [bob["id"]]})
    assert [p["id"] for p in only_bob.json()["task"]["participants"]] == [bob["id"]]
    unknown = await user_client.patch(url, json={"participant_ids": [subjects["MISSION"]]})
    assert unknown.status_code == 404
    as_task = await user_client.patch(url, json={"kind": "TASK"})
    assert as_task.json()["task"]["participants"] == []


async def test_carry_over(
    user_client: AsyncClient, mission_id: str, subjects: dict[str, str]
) -> None:
    original = (await task(user_client, subjects["INTERCONTRACT"], starts_at="09:00:00"))["task"]
    response = await user_client.post(f"{TASKS}/{original['id']}/carry-over", json={})
    assert response.status_code == 200, response.text
    copy = response.json()["task"]
    # Next slot: Monday afternoon, empty, filled as INTERCONTRACT.
    assert (copy["date"], copy["period"], copy["status"]) == (MONDAY, "PM", "PLANNED")
    assert (copy["carried_from_id"], copy["starts_at"]) == (original["id"], None)
    listed = {
        t["id"]: t
        for t in (await user_client.get(TASKS, params={"from": MONDAY, "to": MONDAY})).json()
    }
    assert listed[original["id"]]["status"] == "CARRIED_OVER"
    again = await user_client.post(f"{TASKS}/{original['id']}/carry-over", json={})
    assert again.json()["code"] == "TASK_NOT_PLANNED"

    # From Friday afternoon: weekend and an incompatible Monday morning are skipped.
    await fill(user_client, "LEAVE", "2026-03-09")
    await fill(user_client, "INTERCONTRACT", "2026-03-10")
    friday = await user_client.post(
        f"{TASKS}/{copy['id']}/carry-over", json={"not_before": "2026-03-06"}
    )
    assert (friday.json()["task"]["date"], friday.json()["task"]["period"]) == ("2026-03-06", "AM")
    late = (await task(user_client, subjects["INTERCONTRACT"], "2026-03-06", "PM"))["task"]
    after_weekend = await user_client.post(f"{TASKS}/{late['id']}/carry-over", json={})
    assert after_weekend.json()["task"]["date"] == "2026-03-10"

    explicit = await user_client.post(
        f"{TASKS}/{friday.json()['task']['id']}/carry-over",
        json={"target": {"date": "2026-03-09", "period": "PM"}},
    )
    assert explicit.json()["code"] == "TASK_INCOMPATIBLE_HALF_DAY"

    # A personal subject only lands on existing intercontract half-days.
    await fill(user_client, "MISSION", "2026-03-11", mission_id=mission_id)
    personal = (await task(user_client, subjects["PERSONAL"], "2026-03-10", "PM"))["task"]
    none = await user_client.post(f"{TASKS}/{personal['id']}/carry-over", json={})
    assert none.status_code == 409
    assert none.json()["code"] == "NO_COMPATIBLE_HALF_DAY"


async def test_rg13_locked_month_blocks_task_writes(
    user_client: AsyncClient, subjects: dict[str, str]
) -> None:
    await post(user_client, BULK, {"slots": weekday_slots(2026, 3), "kind": "INTERCONTRACT"})
    created = (await task(user_client, subjects["INTERCONTRACT"]))["task"]
    april = (await task(user_client, subjects["INTERCONTRACT"], "2026-04-01"))["task"]
    await post(user_client, "/api/v1/agenda/months/2026/3/lock", {})
    url = f"{TASKS}/{created['id']}"

    assert (await task(user_client, subjects["INTERCONTRACT"], status=409))["code"] == (
        "MONTH_LOCKED"
    )
    assert (await user_client.patch(url, json={"title": "x"})).status_code == 409
    assert (await user_client.patch(url, json={"status": "DONE"})).status_code == 409
    assert (await user_client.delete(url)).status_code == 409
    assert (await user_client.post(f"{url}/carry-over", json={})).status_code == 409
    into_march = await user_client.patch(f"{TASKS}/{april['id']}", json={"date": MONDAY})
    assert into_march.json()["code"] == "MONTH_LOCKED"
    # Notes stay editable (ADR-0021).
    notes = await user_client.patch(url, json={"description": "compte rendu"})
    assert notes.status_code == 200
    # An edit form sends every field back: unchanged values do not count as changes.
    resent = await user_client.patch(
        url,
        json={
            "date": created["date"],
            "period": created["period"],
            "subject_id": subjects["INTERCONTRACT"],
            "kind": "TASK",
            "title": " Work ",
            "starts_at": None,
            "duration_minutes": 60,
            "status": "PLANNED",
            "external_ref": "",
            "participant_ids": [],
            "description": "compte rendu complet",
        },
    )
    assert resent.status_code == 200, resent.text
    assert resent.json()["task"]["description"] == "compte rendu complet"
    for change in (
        {"starts_at": "09:00:00"},
        {"external_ref": "X-1"},
        {"duration_minutes": 30},
        {"period": "PM"},
    ):
        refused = await user_client.patch(url, json={**change, "description": "x"})
        assert refused.json()["code"] == "MONTH_LOCKED", change
    log = await user_client.put(
        f"/api/v1/agenda/daily-logs/{MONDAY}", json={"done": "x", "planned": "", "blockers": ""}
    )
    assert log.status_code == 200


async def test_daily_log_and_standup(user_client: AsyncClient, subjects: dict[str, str]) -> None:
    url = "/api/v1/agenda/daily-logs/2026-03-04"
    empty = (await user_client.get(url)).json()
    assert empty == {
        "date": "2026-03-04",
        "done": "",
        "planned": "",
        "blockers": "",
        "updated_at": None,
    }
    written = await user_client.put(
        url, json={"done": "Revue", "planned": "Démo", "blockers": "VPN"}
    )
    assert written.json()["blockers"] == "VPN"
    assert written.json()["updated_at"] is not None
    rewritten = await user_client.put(url, json={"done": "Revue", "planned": "", "blockers": ""})
    assert rewritten.json()["blockers"] == ""

    done = (await task(user_client, subjects["INTERCONTRACT"], MONDAY, title="Lire"))["task"]
    await user_client.patch(f"{TASKS}/{done['id']}", json={"status": "DONE"})
    today = await task(user_client, subjects["INTERCONTRACT"], "2026-03-04", title="Écrire")
    standup = (
        await user_client.get("/api/v1/agenda/standup", params={"date": "2026-03-04"})
    ).json()
    assert standup["day"] == "2026-03-04"
    assert standup["previous_day"] == MONDAY
    assert [t["title"] for t in standup["previous"]] == ["Lire"]
    assert [t["id"] for t in standup["today"]] == [today["task"]["id"]]
    assert standup["log"]["done"] == "Revue"
    nothing = (await user_client.get("/api/v1/agenda/standup", params={"date": MONDAY})).json()
    assert (nothing["previous_day"], nothing["previous"]) == (None, [])


async def test_compatibility_endpoint(user_client: AsyncClient) -> None:
    rules = {r["kind"]: r for r in (await user_client.get("/api/v1/agenda/compatibility")).json()}
    assert rules["MISSION"] == {"kind": "MISSION", "scopes": ["MISSION"], "same_mission": True}
    assert rules["INTERCONTRACT"]["scopes"] == ["INTERCONTRACT", "PERSONAL", "TRAINING"]
    assert rules["LEAVE"]["scopes"] == []
    assert len(rules) == 7


async def test_tasks_and_logs_are_private(
    user_client: AsyncClient, other_client: AsyncClient, subjects: dict[str, str]
) -> None:
    """ADR-0010: another user neither sees nor changes tasks, nor uses someone's subject."""
    mine = (await task(user_client, subjects["INTERCONTRACT"]))["task"]
    await user_client.put(
        f"/api/v1/agenda/daily-logs/{MONDAY}",
        json={"done": "secret", "planned": "", "blockers": ""},
    )
    assert (await other_client.get(TASKS, params={"from": MONDAY, "to": MONDAY})).json() == []
    assert (
        await other_client.patch(f"{TASKS}/{mine['id']}", json={"title": "x"})
    ).status_code == 404
    assert (await other_client.delete(f"{TASKS}/{mine['id']}")).status_code == 404
    carry = await other_client.post(f"{TASKS}/{mine['id']}/carry-over", json={})
    assert carry.status_code == 404
    stolen = await other_client.post(
        TASKS,
        json={
            "date": MONDAY,
            "period": "AM",
            "subject_id": subjects["INTERCONTRACT"],
            "title": "x",
            "duration_minutes": 30,
        },
    )
    assert stolen.status_code == 404
    log = (await other_client.get(f"/api/v1/agenda/daily-logs/{MONDAY}")).json()
    assert log["done"] == ""
    standup = await other_client.get("/api/v1/agenda/standup", params={"date": "2026-03-03"})
    assert standup.json()["previous"] == []
