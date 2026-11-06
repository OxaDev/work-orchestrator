"""Week templates (P6, ADR-0035): CRUD, preview, application, RG-10, holidays, locks, missions."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_agenda import slots, weekday_slots
from tests.integration.test_subjects import create_mission, post, subject

URL = "/api/v1/agenda/week-templates"
BULK = "/api/v1/agenda/half-days/bulk"
MAY = {"start": "2026-05-01", "end": "2026-05-31"}


def three_two(mission_id: str | None = None) -> list[dict[str, Any]]:
    """3 days on site, 2 days remote, mornings and afternoons."""
    return [
        {
            "weekday": weekday,
            "period": period,
            "kind": "MISSION",
            "mission_id": mission_id,
            "location": "CLIENT_ON_SITE" if weekday < 3 else "REMOTE_HOME",
        }
        for weekday in range(5)
        for period in ("AM", "PM")
    ]


@pytest.fixture
async def mission_id(user_client: AsyncClient) -> str:
    return await create_mission(user_client)


@pytest.fixture
async def template(user_client: AsyncClient, mission_id: str) -> dict[str, Any]:
    return await post(
        user_client,
        URL,
        {"name": "3/2 Bank", "mission_id": mission_id, "slots": three_two()},
    )


async def half_days(client: AsyncClient, start: str, end: str) -> dict[str, dict[str, Any]]:
    rows = (await client.get("/api/v1/agenda/half-days", params={"from": start, "to": end})).json()
    return {f"{row['date']}|{row['period']}": row for row in rows}


async def test_crud_and_duplicate(
    user_client: AsyncClient, mission_id: str, template: dict[str, Any]
) -> None:
    assert template["mission_id"] == mission_id
    assert len(template["slots"]) == 10
    assert template["slots"][0] == {
        "weekday": 0,
        "period": "AM",
        "kind": "MISSION",
        "subtype_id": None,
        "mission_id": None,
        "location": "CLIENT_ON_SITE",
    }
    other = await post(user_client, URL, {"name": "Intercontrat", "slots": []})
    listed = (await user_client.get(URL)).json()
    assert [t["name"] for t in listed] == ["3/2 Bank", "Intercontrat"]
    for_mission = (await user_client.get(URL, params={"mission_id": mission_id})).json()
    assert [t["id"] for t in for_mission] == [template["id"]]

    patched = await user_client.patch(
        f"{URL}/{template['id']}",
        json={
            "name": "4/1 Bank",
            "description": "Le vendredi au calme",
            "slots": [{"weekday": 4, "period": "AM", "kind": "MISSION", "location": "REMOTE_HOME"}],
        },
    )
    assert patched.status_code == 200, patched.text
    assert (patched.json()["name"], len(patched.json()["slots"])) == ("4/1 Bank", 1)
    assert patched.json()["mission_id"] == mission_id  # omitted: unchanged
    unlinked = await user_client.patch(f"{URL}/{template['id']}", json={"mission_id": None})
    assert unlinked.json()["mission_id"] is None

    copy = await post(user_client, f"{URL}/{template['id']}/duplicate", {"name": "Copie"})
    assert copy["slots"] == patched.json()["slots"]
    assert copy["description"] == "Le vendredi au calme"
    taken = await user_client.post(f"{URL}/{template['id']}/duplicate", json={"name": "copie "})
    assert taken.status_code == 409
    assert taken.json()["code"] == "NAME_ALREADY_USED"
    rename = await user_client.patch(f"{URL}/{other['id']}", json={"name": "4/1 BANK"})
    assert rename.json()["code"] == "NAME_ALREADY_USED"

    assert (await user_client.delete(f"{URL}/{copy['id']}")).status_code == 204
    assert (await user_client.get(f"{URL}/{copy['id']}")).status_code == 404


async def test_slot_validation(user_client: AsyncClient, mission_id: str) -> None:
    async def create(*slots_: dict[str, Any]) -> dict[str, Any]:
        response = await user_client.post(URL, json={"name": "X", "slots": list(slots_)})
        assert response.status_code == 422, response.text
        result: dict[str, Any] = response.json()
        return result

    am = {"weekday": 0, "period": "AM"}
    duplicate = await create({**am, "kind": "LEAVE"}, {**am, "kind": "OFF"})
    assert duplicate["code"] == "WEEK_TEMPLATE_DUPLICATE_SLOT"
    assert duplicate["params"] == {"weekday": 0, "period": "AM"}
    mission = await create({**am, "kind": "INTERCONTRACT", "mission_id": mission_id})
    assert mission["code"] == "HALF_DAY_MISSION_NOT_ALLOWED"
    location = await create({**am, "kind": "LEAVE", "location": "REMOTE_HOME"})
    assert location["code"] == "LOCATION_NOT_ALLOWED"
    subtypes = (await user_client.get("/api/v1/agenda/subtypes")).json()
    leave = next((s for s in subtypes if s["kind"] == "LEAVE"), None) or await post(
        user_client, "/api/v1/agenda/subtypes", {"kind": "LEAVE", "name_fr": "CP", "name_en": "PL"}
    )
    mismatch = await create({**am, "kind": "OFF", "subtype_id": leave["id"]})
    assert mismatch["code"] == "SUBTYPE_KIND_MISMATCH"
    weekday = await create({"weekday": 7, "period": "AM", "kind": "OFF"})
    assert weekday["code"] == "VALIDATION_ERROR"

    # A subtype used by a template cannot be deleted.
    await post(
        user_client,
        URL,
        {"name": "Congés", "slots": [{**am, "kind": "LEAVE", "subtype_id": leave["id"]}]},
    )
    refused = await user_client.delete(f"/api/v1/agenda/subtypes/{leave['id']}")
    assert refused.json()["params"] == {"entity": "halfDaySubtype", "referencedBy": "weekTemplate"}


async def test_rg10_preview_then_apply_keeps_filled_half_days_and_skips_holidays(
    user_client: AsyncClient, mission_id: str, template: dict[str, Any]
) -> None:
    await post(user_client, BULK, {"slots": slots("2026-05-11", "2026-05-12"), "kind": "LEAVE"})
    preview = await post(user_client, f"{URL}/{template['id']}/preview", MAY)
    # May 2026: 21 weekdays; 1, 8, 14 and 25 May are public holidays; 11-12 May are leave.
    assert preview["counts"] == {"HOLIDAY": 8, "KEEP": 4, "CREATE": 30}
    assert len(preview["items"]) == 42
    first = preview["items"][0]
    assert (first["date"], first["action"], first["existing"]) == ("2026-05-01", "HOLIDAY", None)
    kept = next(i for i in preview["items"] if i["date"] == "2026-05-11")
    assert (kept["action"], kept["existing"]["kind"]) == ("KEEP", "LEAVE")
    assert len(await half_days(user_client, "2026-05-01", "2026-05-31")) == 4  # nothing written

    applied = await post(user_client, f"{URL}/{template['id']}/apply", MAY)
    assert applied["applied"] == 30
    rows = await half_days(user_client, "2026-05-01", "2026-05-31")
    assert len(rows) == 34
    monday, thursday = rows["2026-05-04|AM"], rows["2026-05-07|PM"]
    assert (monday["kind"], monday["mission_id"], monday["location"]) == (
        "MISSION",
        mission_id,
        "CLIENT_ON_SITE",
    )
    assert thursday["location"] == "REMOTE_HOME"
    assert rows["2026-05-11|AM"]["kind"] == "LEAVE"
    assert "2026-05-08|AM" not in rows
    # Idempotent: applying again changes nothing.
    again = await post(user_client, f"{URL}/{template['id']}/apply", MAY)
    assert again["applied"] == 0
    assert again["counts"] == {"HOLIDAY": 8, "KEEP": 4, "UNCHANGED": 30}


async def test_overwrite_replaces_but_never_strands_tasks(
    user_client: AsyncClient, template: dict[str, Any]
) -> None:
    await post(
        user_client,
        BULK,
        {"slots": slots("2026-05-11"), "kind": "LEAVE", "note": "Pont perso"},
    )
    await post(user_client, BULK, {"slots": slots("2026-05-12"), "kind": "INTERCONTRACT"})
    veille = await subject(user_client, "Veille")
    await post(
        user_client,
        "/api/v1/agenda/tasks",
        {
            "date": "2026-05-12",
            "period": "PM",
            "subject_id": veille["id"],
            "title": "Lire",
            "duration_minutes": 60,
        },
    )
    body = {"start": "2026-05-11", "end": "2026-05-12", "strategy": "OVERWRITE"}
    preview = await post(user_client, f"{URL}/{template['id']}/preview", body)
    actions = {f"{i['date']}|{i['period']}": i["action"] for i in preview["items"]}
    assert actions == {
        "2026-05-11|AM": "OVERWRITE",
        "2026-05-11|PM": "OVERWRITE",
        "2026-05-12|AM": "OVERWRITE",
        "2026-05-12|PM": "BLOCKED_BY_TASKS",
    }
    applied = await post(user_client, f"{URL}/{template['id']}/apply", body)
    assert applied["applied"] == 3
    rows = await half_days(user_client, "2026-05-11", "2026-05-12")
    assert (rows["2026-05-11|AM"]["kind"], rows["2026-05-11|AM"]["note"]) == (
        "MISSION",
        "Pont perso",
    )
    assert rows["2026-05-12|PM"]["kind"] == "INTERCONTRACT"


async def test_mission_end_override_and_missing_mission(
    user_client: AsyncClient, mission_id: str
) -> None:
    await user_client.patch(
        f"/api/v1/missions/{mission_id}", json={"actual_end_date": "2026-05-20"}
    )
    generic = await post(user_client, URL, {"name": "3/2", "slots": three_two()})
    missing = await user_client.post(f"{URL}/{generic['id']}/preview", json=MAY)
    assert missing.status_code == 422
    assert missing.json()["code"] == "WEEK_TEMPLATE_MISSION_REQUIRED"

    applied = await post(
        user_client, f"{URL}/{generic['id']}/apply", {**MAY, "mission_id": mission_id}
    )
    # After 20 May the mission is over (RG-02): 21, 22, 26-29 May stay empty.
    assert applied["counts"] == {"HOLIDAY": 8, "CREATE": 22, "OUTSIDE_MISSION": 12}
    rows = await half_days(user_client, "2026-05-01", "2026-05-31")
    assert max(rows) == "2026-05-20|PM"

    other = await create_mission(user_client, "Insurer")
    own_slot = await post(
        user_client,
        URL,
        {
            "name": "Mixed",
            "slots": [
                {"weekday": 0, "period": "AM", "kind": "MISSION", "mission_id": other},
                {"weekday": 0, "period": "PM", "kind": "INTERCONTRACT"},
            ],
        },
    )
    mixed = await post(user_client, f"{URL}/{own_slot['id']}/preview", MAY)
    monday = {i["period"]: i for i in mixed["items"] if i["date"] == "2026-05-04"}
    assert monday["AM"]["mission_id"] == other
    assert monday["PM"]["mission_id"] is None


async def test_locked_months_are_skipped_and_reported(
    user_client: AsyncClient, template: dict[str, Any]
) -> None:
    await post(user_client, BULK, {"slots": weekday_slots(2026, 4), "kind": "INTERCONTRACT"})
    await post(user_client, "/api/v1/agenda/months/2026/4/lock", {})
    body = {"start": "2026-04-27", "end": "2026-05-06", "strategy": "OVERWRITE"}
    applied = await post(user_client, f"{URL}/{template['id']}/apply", body)
    # 27-30 April locked (8 half-days), 1 May holiday, 4-6 May created.
    assert applied["counts"] == {"LOCKED": 8, "HOLIDAY": 2, "CREATE": 6}
    rows = await half_days(user_client, "2026-04-27", "2026-05-06")
    assert rows["2026-04-27|AM"]["kind"] == "INTERCONTRACT"
    assert rows["2026-05-04|AM"]["kind"] == "MISSION"


async def test_range_checks(user_client: AsyncClient, template: dict[str, Any]) -> None:
    preview = f"{URL}/{template['id']}/preview"
    reversed_ = await user_client.post(preview, json={"start": "2026-05-02", "end": "2026-05-01"})
    assert reversed_.json()["code"] == "INVALID_DATE_RANGE"
    too_long = await user_client.post(preview, json={"start": "2026-01-01", "end": "2027-01-02"})
    assert too_long.json()["code"] == "RANGE_TOO_LARGE"
    assert too_long.json()["params"] == {"maxDays": 366}
    a_year = await user_client.post(preview, json={"start": "2026-01-01", "end": "2027-01-01"})
    assert a_year.status_code == 200


async def test_week_templates_are_private(
    user_client: AsyncClient,
    other_client: AsyncClient,
    mission_id: str,
    template: dict[str, Any],
) -> None:
    """ADR-0010: other users neither see, change nor apply someone's templates or missions."""
    assert (await other_client.get(URL)).json() == []
    url = f"{URL}/{template['id']}"
    assert (await other_client.get(url)).status_code == 404
    assert (await other_client.patch(url, json={"name": "x"})).status_code == 404
    assert (await other_client.post(f"{url}/apply", json=MAY)).status_code == 404
    assert (await other_client.post(f"{url}/duplicate", json={"name": "x"})).status_code == 404
    assert (await other_client.delete(url)).status_code == 404
    stolen = await other_client.post(URL, json={"name": "Mine", "slots": three_two(mission_id)})
    assert stolen.status_code == 404
    # Same name, other owner: allowed.
    assert (await other_client.post(URL, json={"name": "3/2 Bank"})).status_code == 201
    # A mission referenced by a template is archived, not deleted (RG-12).
    assert (await user_client.delete(f"/api/v1/missions/{mission_id}")).status_code == 409
