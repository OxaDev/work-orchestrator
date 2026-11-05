"""Companies and their organisation (P2-2, P2-3, P2-5, P2-6)."""

import uuid
from typing import Any

from httpx import AsyncClient


async def _post(client: AsyncClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


async def test_company_lifecycle(user_client: AsyncClient) -> None:
    sector = await _post(user_client, "/api/v1/sectors", {"name_fr": "Banque", "name_en": "Bank"})
    other = await _post(user_client, "/api/v1/sectors", {"name_fr": "Paiement", "name_en": "Pay"})
    tag = await _post(user_client, "/api/v1/tags", {"name": "Critique"})
    group = await _post(user_client, "/api/v1/companies", {"name": "Groupe Horizon"})

    company = await _post(
        user_client,
        "/api/v1/companies",
        {
            "name": "  Banque Horizon ",
            "types": ["CLIENT", "CLIENT", "ESN"],
            "primary_sector_id": sector["id"],
            "secondary_sector_ids": [other["id"]],
            "parent_company_id": group["id"],
            "website": "https://horizon.example",
            "notes": "**Important**",
            "tag_ids": [tag["id"]],
        },
    )
    assert company["name"] == "Banque Horizon"
    assert company["types"] == ["CLIENT", "ESN"]
    assert company["secondary_sector_ids"] == [other["id"]]
    assert company["parent_company"] == {"id": group["id"], "name": "Groupe Horizon"}
    assert [t["name"] for t in company["tags"]] == ["Critique"]

    duplicate = await user_client.post("/api/v1/companies", json={"name": "banque horizon"})
    assert duplicate.status_code == 409

    patched = await user_client.patch(
        f"/api/v1/companies/{company['id']}",
        json={
            "types": [],
            "primary_sector_id": None,
            "secondary_sector_ids": [],
            "parent_company_id": None,
            "website": None,
            "notes": "",
            "tag_ids": [],
            "name": "Banque Horizon SA",
        },
    )
    body = patched.json()
    assert body["types"] == ["OTHER"]
    assert body["primary_sector_id"] is None
    assert body["parent_company"] is None
    assert body["tags"] == []
    assert body["name"] == "Banque Horizon SA"


async def test_company_filters_and_archiving(user_client: AsyncClient) -> None:
    sector = await _post(user_client, "/api/v1/sectors", {"name_fr": "Assurance", "name_en": "Ins"})
    tag = await _post(user_client, "/api/v1/tags", {"name": "Prospect"})
    insurer = await _post(
        user_client,
        "/api/v1/companies",
        {
            "name": "Atlas Assurances",
            "secondary_sector_ids": [sector["id"]],
            "tag_ids": [tag["id"]],
        },
    )
    await _post(user_client, "/api/v1/companies", {"name": "Néo Consulting", "types": ["ESN"]})

    async def names(**params: Any) -> list[str]:
        response = await user_client.get("/api/v1/companies", params=params)
        return [c["name"] for c in response.json()["items"]]

    assert await names(q="neo") == ["Néo Consulting"]
    assert await names(type="ESN") == ["Néo Consulting"]
    assert await names(sector_id=sector["id"]) == ["Atlas Assurances"]
    assert await names(tag_id=tag["id"]) == ["Atlas Assurances"]

    archived = await user_client.post(f"/api/v1/companies/{insurer['id']}/archive")
    assert archived.json()["archived_at"] is not None
    assert await names() == ["Néo Consulting"]
    assert len(await names(include_archived=True)) == 2
    await user_client.post(f"/api/v1/companies/{insurer['id']}/restore")
    assert len(await names()) == 2


async def test_company_parent_cycle_and_unknown_references(user_client: AsyncClient) -> None:
    parent = await _post(user_client, "/api/v1/companies", {"name": "Parent"})
    child = await _post(
        user_client, "/api/v1/companies", {"name": "Child", "parent_company_id": parent["id"]}
    )
    cycle = await user_client.patch(
        f"/api/v1/companies/{parent['id']}", json={"parent_company_id": child["id"]}
    )
    assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"
    for body in (
        {"name": "X", "primary_sector_id": str(uuid.uuid4())},
        {"name": "Y", "secondary_sector_ids": [str(uuid.uuid4())]},
        {"name": "Z", "parent_company_id": str(uuid.uuid4())},
    ):
        assert (await user_client.post("/api/v1/companies", json=body)).status_code == 404
    assert (await user_client.get(f"/api/v1/companies/{uuid.uuid4()}")).status_code == 404


async def test_org_unit_tree(user_client: AsyncClient) -> None:
    bank = await _post(user_client, "/api/v1/companies", {"name": "Bank"})
    other = await _post(user_client, "/api/v1/companies", {"name": "Other"})
    base = f"/api/v1/companies/{bank['id']}/org-units"
    dsi = await _post(user_client, base, {"name": "DSI", "level_label": "Direction"})
    pole = await _post(user_client, base, {"name": "Paiements", "parent_id": dsi["id"]})
    team = await _post(user_client, base, {"name": "Cartes", "parent_id": pole["id"]})

    units = (await user_client.get(base)).json()
    assert [u["name"] for u in units] == ["Cartes", "DSI", "Paiements"]
    ancestors = (await user_client.get(f"/api/v1/org-units/{team['id']}/ancestors")).json()
    assert [u["name"] for u in ancestors] == ["Paiements", "DSI"]
    descendants = (await user_client.get(f"/api/v1/org-units/{dsi['id']}/descendants")).json()
    assert {u["name"] for u in descendants} == {"Paiements", "Cartes"}

    foreign = await _post(user_client, f"/api/v1/companies/{other['id']}/org-units", {"name": "IT"})
    mismatch = await user_client.post(base, json={"name": "X", "parent_id": foreign["id"]})
    assert mismatch.status_code == 422
    assert mismatch.json()["code"] == "ORG_UNIT_COMPANY_MISMATCH"
    cycle = await user_client.patch(
        f"/api/v1/org-units/{dsi['id']}", json={"parent_id": team["id"]}
    )
    assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"

    moved = await user_client.patch(
        f"/api/v1/org-units/{team['id']}",
        json={
            "parent_id": dsi["id"],
            "name": "Équipe Cartes",
            "level_label": "Équipe",
            "description": "d",
        },
    )
    assert moved.json()["parent_id"] == dsi["id"]
    assert moved.json()["level_label"] == "Équipe"

    blocked = await user_client.delete(f"/api/v1/org-units/{dsi['id']}")
    assert blocked.json()["params"] == {"entity": "orgUnit", "referencedBy": "orgUnit"}
    await _post(
        user_client,
        "/api/v1/contacts",
        {"first_name": "A", "last_name": "B", "org_unit_id": pole["id"]},
    )
    with_contact = await user_client.delete(f"/api/v1/org-units/{pole['id']}")
    assert with_contact.json()["params"]["referencedBy"] == "contact"
    assert (await user_client.delete(f"/api/v1/org-units/{team['id']}")).status_code == 204
    assert (await user_client.delete(f"/api/v1/org-units/{team['id']}")).status_code == 404
    assert (await user_client.get(f"/api/v1/companies/{uuid.uuid4()}/org-units")).status_code == 404


async def test_employer_company_on_profile(user_client: AsyncClient) -> None:
    esn = await _post(user_client, "/api/v1/companies", {"name": "Néo", "types": ["ESN"]})
    response = await user_client.patch("/api/v1/me", json={"employer_company_id": esn["id"]})
    assert response.json()["employer_company_id"] == esn["id"]
    kept = await user_client.patch("/api/v1/me", json={"locale": "en"})
    assert kept.json()["employer_company_id"] == esn["id"]
    cleared = await user_client.patch("/api/v1/me", json={"employer_company_id": None})
    assert cleared.json()["employer_company_id"] is None
    unknown = await user_client.patch("/api/v1/me", json={"employer_company_id": str(uuid.uuid4())})
    assert unknown.status_code == 404
