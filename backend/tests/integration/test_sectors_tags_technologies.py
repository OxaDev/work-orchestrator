"""Sectors, tags and technology catalogue (P2-1, P2-11, P2-12)."""

import uuid
from typing import Any

from httpx import AsyncClient


async def _sector(client: AsyncClient, name: str, parent_id: str | None = None) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/sectors", json={"name_fr": name, "name_en": f"{name} EN", "parent_id": parent_id}
    )
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


async def test_sector_tree_crud(user_client: AsyncClient) -> None:
    finance = await _sector(user_client, "Finance")
    bank = await _sector(user_client, "Banque", finance["id"])
    sectors = {s["id"]: s for s in (await user_client.get("/api/v1/sectors")).json()}
    assert sectors[bank["id"]]["parent_id"] == finance["id"]

    renamed = await user_client.patch(f"/api/v1/sectors/{bank['id']}", json={"name_en": "Banking"})
    assert renamed.json()["name_en"] == "Banking"
    assert renamed.json()["parent_id"] == finance["id"]

    to_root = await user_client.patch(f"/api/v1/sectors/{bank['id']}", json={"parent_id": None})
    assert to_root.json()["parent_id"] is None


async def test_sector_cycle_and_unknown_parent_are_rejected(user_client: AsyncClient) -> None:
    root = await _sector(user_client, "Root")
    child = await _sector(user_client, "Child", root["id"])
    cycle = await user_client.patch(
        f"/api/v1/sectors/{root['id']}", json={"parent_id": child["id"]}
    )
    assert cycle.status_code == 409
    assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"
    unknown = await user_client.post(
        "/api/v1/sectors", json={"name_fr": "X", "name_en": "X", "parent_id": str(uuid.uuid4())}
    )
    assert unknown.status_code == 404
    assert unknown.json()["params"] == {"entity": "sector"}


async def test_sector_deletion_rules(user_client: AsyncClient) -> None:
    root = await _sector(user_client, "Root")
    child = await _sector(user_client, "Child", root["id"])
    used = await _sector(user_client, "Used")
    await user_client.post(
        "/api/v1/companies", json={"name": "Acme", "secondary_sector_ids": [used["id"]]}
    )

    with_child = await user_client.delete(f"/api/v1/sectors/{root['id']}")
    assert with_child.status_code == 409
    assert with_child.json()["params"] == {"entity": "sector", "referencedBy": "sector"}
    in_use = await user_client.delete(f"/api/v1/sectors/{used['id']}")
    assert in_use.json()["params"]["referencedBy"] == "company"
    sectors = {s["id"]: s for s in (await user_client.get("/api/v1/sectors")).json()}
    assert sectors[used["id"]]["company_count"] == 1

    assert (await user_client.delete(f"/api/v1/sectors/{child['id']}")).status_code == 204
    assert (await user_client.delete(f"/api/v1/sectors/{root['id']}")).status_code == 204


async def test_tags_crud_and_usage(user_client: AsyncClient) -> None:
    created = await user_client.post("/api/v1/tags", json={"name": "Critique", "color": "red"})
    assert created.status_code == 201
    tag_id = created.json()["id"]
    duplicate = await user_client.post("/api/v1/tags", json={"name": " critique "})
    assert duplicate.status_code == 409
    assert duplicate.json()["params"] == {"entity": "tag"}

    await user_client.post("/api/v1/technologies", json={"name": "COBOL", "tag_ids": [tag_id]})
    tags = (await user_client.get("/api/v1/tags")).json()
    assert tags == [{"id": tag_id, "name": "Critique", "color": "red", "usage": 1}]

    updated = await user_client.patch(
        f"/api/v1/tags/{tag_id}", json={"name": "Critical", "color": "orange"}
    )
    assert updated.json() == {"id": tag_id, "name": "Critical", "color": "orange"}
    bad_color = await user_client.post("/api/v1/tags", json={"name": "x", "color": "rainbow"})
    assert bad_color.status_code == 422

    assert (await user_client.delete(f"/api/v1/tags/{tag_id}")).status_code == 204
    technology = (await user_client.get("/api/v1/technologies", params={"q": "cobol"})).json()
    assert technology["items"][0]["tags"] == []
    assert (await user_client.delete(f"/api/v1/tags/{tag_id}")).status_code == 404


async def test_unknown_tag_is_rejected_on_assignment(user_client: AsyncClient) -> None:
    response = await user_client.post(
        "/api/v1/technologies", json={"name": "Go", "tag_ids": [str(uuid.uuid4())]}
    )
    assert response.status_code == 404
    assert response.json()["params"] == {"entity": "tag"}


async def test_technology_catalogue(user_client: AsyncClient) -> None:
    created = await user_client.post(
        "/api/v1/technologies",
        json={
            "name": "Apache Kafka",
            "category": "MESSAGING",
            "aliases": ["Kafka", " kafka ", ""],
            "website": "https://kafka.apache.org",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["aliases"] == ["Kafka"]
    assert body["website"] == "https://kafka.apache.org/"

    duplicate = await user_client.post("/api/v1/technologies", json={"name": "apache  KAFKA"})
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"

    by_alias = await user_client.get("/api/v1/technologies", params={"q": "kafka"})
    assert by_alias.json()["total"] == 1
    by_category = await user_client.get("/api/v1/technologies", params={"category": "DATABASE"})
    assert by_category.json()["total"] == 0

    tech_id = body["id"]
    patched = await user_client.patch(
        f"/api/v1/technologies/{tech_id}",
        json={"name": "Kafka", "description": "Event streaming", "website": None, "aliases": []},
    )
    assert patched.json()["name"] == "Kafka"
    assert patched.json()["website"] is None

    archived = await user_client.post(f"/api/v1/technologies/{tech_id}/archive")
    assert archived.json()["archived_at"] is not None
    assert (await user_client.get("/api/v1/technologies")).json()["total"] == 0
    listing = await user_client.get("/api/v1/technologies", params={"include_archived": True})
    assert listing.json()["total"] == 1
    restored = await user_client.post(f"/api/v1/technologies/{tech_id}/restore")
    assert restored.json()["archived_at"] is None
    assert (await user_client.get(f"/api/v1/technologies/{tech_id}")).status_code == 200
    assert (await user_client.get(f"/api/v1/technologies/{uuid.uuid4()}")).status_code == 404
