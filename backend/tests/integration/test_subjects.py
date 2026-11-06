"""Subjects (P5-1, P5-2, ADR-0034): RG-07, RG-08, archiving, categories, isolation."""

from typing import Any

import pytest
from httpx import AsyncClient

SUBJECTS = "/api/v1/subjects"


async def post(client: AsyncClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=body)
    assert response.status_code in (200, 201), response.text
    result: dict[str, Any] = response.json()
    return result


async def create_mission(client: AsyncClient, title: str = "Bank — Dev") -> str:
    bank = await post(client, "/api/v1/companies", {"name": f"Client {title}"})
    esn = await post(client, "/api/v1/companies", {"name": f"ESN {title}", "types": ["ESN"]})
    mission = await post(
        client,
        "/api/v1/missions",
        {
            "title": title,
            "job_title": "Dev",
            "client_id": bank["id"],
            "employer_company_id": esn["id"],
            "start_date": "2026-01-05",
            "planned_end_date": "2026-12-31",
        },
    )
    return str(mission["id"])


@pytest.fixture
async def mission_id(user_client: AsyncClient) -> str:
    return await create_mission(user_client)


async def subject(client: AsyncClient, title: str, **fields: Any) -> dict[str, Any]:
    return await post(client, SUBJECTS, {"title": title, "scope": "INTERCONTRACT", **fields})


async def test_create_and_list_by_mission_and_scope(
    user_client: AsyncClient, mission_id: str
) -> None:
    kafka = await subject(
        user_client,
        " Migration Kafka ",
        scope="MISSION",
        mission_id=mission_id,
        external_url="https://jira.example.com/browse/K-1",
    )
    assert kafka["title"] == "Migration Kafka"
    assert kafka["status"] == "OPEN"
    assert kafka["external_url"] == "https://jira.example.com/browse/K-1"
    assert (kafka["task_count"], kafka["done_minutes"]) == (0, 0)
    await subject(user_client, "Veille Rust")

    by_mission = (await user_client.get(SUBJECTS, params={"mission_id": mission_id})).json()
    assert [s["title"] for s in by_mission] == ["Migration Kafka"]
    by_scope = (await user_client.get(SUBJECTS, params={"scope": "INTERCONTRACT"})).json()
    assert [s["title"] for s in by_scope] == ["Veille Rust"]
    found = (await user_client.get(SUBJECTS, params={"q": "kaf"})).json()
    assert [s["id"] for s in found] == [kafka["id"]]
    assert (await user_client.get(f"{SUBJECTS}/{kafka['id']}")).json()["title"] == kafka["title"]


async def test_scope_and_mission_go_together(user_client: AsyncClient, mission_id: str) -> None:
    missing = await user_client.post(SUBJECTS, json={"title": "X", "scope": "MISSION"})
    assert missing.json()["code"] == "SUBJECT_MISSION_REQUIRED"
    extra = await user_client.post(
        SUBJECTS, json={"title": "X", "scope": "PERSONAL", "mission_id": mission_id}
    )
    assert extra.json()["code"] == "SUBJECT_MISSION_NOT_ALLOWED"


async def test_rg07_children_inherit_scope_and_mission(
    user_client: AsyncClient, mission_id: str
) -> None:
    parent = await subject(user_client, "SSO", scope="MISSION", mission_id=mission_id)
    child = await subject(
        user_client, "Keycloak", scope="MISSION", mission_id=mission_id, parent_id=parent["id"]
    )
    assert child["parent_id"] == parent["id"]
    other_mission = await create_mission(user_client, "Insurer")
    for body in (
        {"scope": "INTERCONTRACT"},
        {"scope": "MISSION", "mission_id": other_mission},
    ):
        response = await user_client.post(
            SUBJECTS, json={"title": "Bad", "parent_id": parent["id"], **body}
        )
        assert response.status_code == 422
        assert response.json()["code"] == "SUBJECT_SCOPE_MISMATCH"

    # A child cannot diverge from its parent.
    diverge = await user_client.patch(f"{SUBJECTS}/{child['id']}", json={"scope": "PERSONAL"})
    assert diverge.json()["code"] == "SUBJECT_SCOPE_MISMATCH"
    # Moving under a parent of another scope is refused.
    veille = await subject(user_client, "Veille")
    move = await user_client.patch(f"{SUBJECTS}/{child['id']}", json={"parent_id": veille["id"]})
    assert move.json()["code"] == "SUBJECT_SCOPE_MISMATCH"


async def test_rg07_scope_change_propagates_to_the_subtree(
    user_client: AsyncClient, mission_id: str
) -> None:
    root = await subject(user_client, "Certification AWS")
    child = await subject(user_client, "Module S3", parent_id=root["id"])
    changed = await user_client.patch(f"{SUBJECTS}/{root['id']}", json={"scope": "TRAINING"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["scope"] == "TRAINING"
    assert (await user_client.get(f"{SUBJECTS}/{child['id']}")).json()["scope"] == "TRAINING"

    to_mission = await user_client.patch(
        f"{SUBJECTS}/{root['id']}", json={"scope": "MISSION", "mission_id": mission_id}
    )
    assert to_mission.json()["mission_id"] == mission_id
    child_after = (await user_client.get(f"{SUBJECTS}/{child['id']}")).json()
    assert (child_after["scope"], child_after["mission_id"]) == ("MISSION", mission_id)
    back = await user_client.patch(f"{SUBJECTS}/{root['id']}", json={"scope": "PERSONAL"})
    assert (back.json()["scope"], back.json()["mission_id"]) == ("PERSONAL", None)


async def test_rg08_subjects_tree_is_acyclic(user_client: AsyncClient) -> None:
    a = await subject(user_client, "A")
    b = await subject(user_client, "B", parent_id=a["id"])
    c = await subject(user_client, "C", parent_id=b["id"])
    for target in (a["id"], c["id"]):
        response = await user_client.patch(f"{SUBJECTS}/{a['id']}", json={"parent_id": target})
        assert response.status_code == 409
        assert response.json()["code"] == "TREE_CYCLE_DETECTED"
    # Valid moves: C to the root, then under A.
    root = await user_client.patch(f"{SUBJECTS}/{c['id']}", json={"parent_id": None})
    assert root.json()["parent_id"] is None
    under_a = await user_client.patch(f"{SUBJECTS}/{c['id']}", json={"parent_id": a["id"]})
    assert under_a.json()["parent_id"] == a["id"]


async def test_edit_archive_restore_and_delete(user_client: AsyncClient) -> None:
    category = (await user_client.get("/api/v1/subject-categories")).json()
    root = await subject(user_client, "Blog")
    child = await subject(user_client, "Article Kafka", parent_id=root["id"])
    edited = await user_client.patch(
        f"{SUBJECTS}/{root['id']}",
        json={
            "title": "Blog technique",
            "status": "IN_PROGRESS",
            "description": "# Notes",
            "external_url": None,
            "category_id": category[0]["id"] if category else None,
        },
    )
    assert edited.status_code == 200, edited.text
    assert (edited.json()["title"], edited.json()["status"]) == ("Blog technique", "IN_PROGRESS")

    archived = await user_client.post(f"{SUBJECTS}/{root['id']}/archive")
    assert archived.json()["archived_at"] is not None
    assert (await user_client.get(SUBJECTS)).json() == []
    with_archived = (await user_client.get(SUBJECTS, params={"include_archived": True})).json()
    assert {s["id"] for s in with_archived} == {root["id"], child["id"]}
    await user_client.post(f"{SUBJECTS}/{root['id']}/restore")
    assert len((await user_client.get(SUBJECTS)).json()) == 2

    refused = await user_client.delete(f"{SUBJECTS}/{root['id']}")
    assert refused.status_code == 409
    assert refused.json()["params"] == {"entity": "subject", "referencedBy": "subject"}
    assert (await user_client.delete(f"{SUBJECTS}/{child['id']}")).status_code == 204
    assert (await user_client.delete(f"{SUBJECTS}/{root['id']}")).status_code == 204
    assert (await user_client.get(f"{SUBJECTS}/{root['id']}")).status_code == 404


async def test_mission_with_subjects_cannot_be_deleted(
    user_client: AsyncClient, mission_id: str
) -> None:
    await subject(user_client, "SSO", scope="MISSION", mission_id=mission_id)
    response = await user_client.delete(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 409


async def test_categories_referential(user_client: AsyncClient) -> None:
    url = "/api/v1/subject-categories"
    created = await post(user_client, url, {"name_fr": "Conférence", "name_en": "Conference"})
    duplicate = await user_client.post(url, json={"name_fr": "conference", "name_en": "x"})
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"
    renamed = await user_client.patch(f"{url}/{created['id']}", json={"name_en": "Talk"})
    assert renamed.json()["name_en"] == "Talk"
    used = await subject(user_client, "DevFest", category_id=created["id"])
    listed = {c["id"]: c for c in (await user_client.get(url)).json()}
    assert listed[created["id"]]["usage"] == 1
    refused = await user_client.delete(f"{url}/{created['id']}")
    assert refused.json()["params"] == {"entity": "subjectCategory", "referencedBy": "subject"}
    await user_client.delete(f"{SUBJECTS}/{used['id']}")
    assert (await user_client.delete(f"{url}/{created['id']}")).status_code == 204
    missing = await user_client.post(
        SUBJECTS, json={"title": "X", "scope": "PERSONAL", "category_id": created["id"]}
    )
    assert missing.status_code == 404


async def test_subjects_are_private(
    user_client: AsyncClient, other_client: AsyncClient, mission_id: str
) -> None:
    """ADR-0010: another user sees nothing and cannot touch or reuse a subject."""
    mine = await subject(user_client, "SSO", scope="MISSION", mission_id=mission_id)
    assert (await other_client.get(SUBJECTS)).json() == []
    assert (await other_client.get(f"{SUBJECTS}/{mine['id']}")).status_code == 404
    patch = await other_client.patch(f"{SUBJECTS}/{mine['id']}", json={"title": "Stolen"})
    assert patch.status_code == 404
    assert (await other_client.delete(f"{SUBJECTS}/{mine['id']}")).status_code == 404
    child = await other_client.post(
        SUBJECTS,
        json={
            "title": "Child",
            "scope": "MISSION",
            "mission_id": mission_id,
            "parent_id": mine["id"],
        },
    )
    assert child.status_code == 404
