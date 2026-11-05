"""Contacts directory, duplicates and employment history (P2-8, P2-9)."""

import uuid
from typing import Any

from httpx import AsyncClient

from tests.conftest import FrozenClock


async def _post(client: AsyncClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


async def _setup(client: AsyncClient) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    bank = await _post(client, "/api/v1/companies", {"name": "Bank"})
    unit = await _post(client, f"/api/v1/companies/{bank['id']}/org-units", {"name": "DSI"})
    insurer = await _post(client, "/api/v1/companies", {"name": "Insurer"})
    return bank, unit, insurer


async def test_create_contact_infers_company_from_org_unit(user_client: AsyncClient) -> None:
    bank, unit, _ = await _setup(user_client)
    tag = await _post(user_client, "/api/v1/tags", {"name": "Clé"})
    contact = await _post(
        user_client,
        "/api/v1/contacts",
        {
            "first_name": " Hélène ",
            "last_name": "Durand",
            "job_title": "  CTO ",
            "email_work": "Helene.Durand@Bank.example",
            "phone_mobile": "  ",
            "linkedin_url": "https://linkedin.example/in/hd",
            "org_unit_id": unit["id"],
            "tag_ids": [tag["id"]],
        },
    )
    assert contact["first_name"] == "Hélène"
    assert contact["job_title"] == "CTO"
    assert contact["email_work"] == "helene.durand@bank.example"
    assert contact["phone_mobile"] is None
    assert contact["company"] == {"id": bank["id"], "name": "Bank"}
    assert contact["org_unit"] == {"id": unit["id"], "name": "DSI"}
    assert contact["employments"] == []
    assert [t["name"] for t in contact["tags"]] == ["Clé"]


async def test_org_unit_must_belong_to_company(user_client: AsyncClient) -> None:
    _, unit, insurer = await _setup(user_client)
    response = await user_client.post(
        "/api/v1/contacts",
        json={
            "first_name": "A",
            "last_name": "B",
            "company_id": insurer["id"],
            "org_unit_id": unit["id"],
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "ORG_UNIT_COMPANY_MISMATCH"
    unknown = await user_client.post(
        "/api/v1/contacts",
        json={"first_name": "A", "last_name": "B", "company_id": str(uuid.uuid4())},
    )
    assert unknown.status_code == 404


async def test_duplicates_by_name_and_email(user_client: AsyncClient) -> None:
    first = await _post(
        user_client,
        "/api/v1/contacts",
        {"first_name": "Élodie", "last_name": "Martin", "email_personal": "elo@home.example"},
    )
    other = await _post(
        user_client,
        "/api/v1/contacts",
        {"first_name": "Sam", "last_name": "Roux", "email_work": "sam@work.example"},
    )
    response = await user_client.get(
        "/api/v1/contacts/duplicates",
        params={"first_name": "elodie", "last_name": " MARTIN", "email": ["SAM@work.example", ""]},
    )
    found = {c["id"]: c["reason"] for c in response.json()}
    assert found == {first["id"]: "SAME_NAME", other["id"]: "SAME_EMAIL"}

    excluded = await user_client.get(
        "/api/v1/contacts/duplicates",
        params={"first_name": "Élodie", "last_name": "Martin", "exclude_id": first["id"]},
    )
    assert excluded.json() == []


async def test_search_filters_and_archive(user_client: AsyncClient) -> None:
    bank, unit, _ = await _setup(user_client)
    tag = await _post(user_client, "/api/v1/tags", {"name": "VIP"})
    await _post(
        user_client,
        "/api/v1/contacts",
        {
            "first_name": "Zoé",
            "last_name": "Albert",
            "org_unit_id": unit["id"],
            "tag_ids": [tag["id"]],
        },
    )
    lone = await _post(
        user_client,
        "/api/v1/contacts",
        {"first_name": "Yann", "last_name": "Bernard", "job_title": "Architecte"},
    )

    async def names(**params: Any) -> list[str]:
        response = await user_client.get("/api/v1/contacts", params=params)
        return [c["last_name"] for c in response.json()["items"]]

    assert await names() == ["Albert", "Bernard"]
    assert await names(q="zoe") == ["Albert"]
    assert await names(q="archi") == ["Bernard"]
    assert await names(company_id=bank["id"]) == ["Albert"]
    assert await names(org_unit_id=unit["id"]) == ["Albert"]
    assert await names(tag_id=tag["id"]) == ["Albert"]

    await user_client.post(f"/api/v1/contacts/{lone['id']}/archive")
    assert await names() == ["Albert"]
    assert await names(include_archived=True) == ["Albert", "Bernard"]
    restored = await user_client.post(f"/api/v1/contacts/{lone['id']}/restore")
    assert restored.json()["archived_at"] is None


async def test_changing_company_records_previous_position(
    user_client: AsyncClient, clock: FrozenClock
) -> None:
    bank, unit, insurer = await _setup(user_client)
    contact = await _post(
        user_client,
        "/api/v1/contacts",
        {"first_name": "A", "last_name": "B", "job_title": "Dev", "org_unit_id": unit["id"]},
    )
    moved = await user_client.patch(
        f"/api/v1/contacts/{contact['id']}",
        json={"company_id": insurer["id"], "job_title": "Lead", "last_name": "Bravo"},
    )
    body = moved.json()
    assert body["company"]["id"] == insurer["id"]
    assert body["org_unit"] is None  # the unit belonged to the previous company
    assert body["last_name"] == "Bravo"
    assert body["employments"] == [
        {
            "id": body["employments"][0]["id"],
            "company": {"id": bank["id"], "name": "Bank"},
            "job_title": "Dev",
            "start_date": None,
            "end_date": clock.now.date().isoformat(),
        }
    ]
    same = await user_client.patch(
        f"/api/v1/contacts/{contact['id']}", json={"company_id": insurer["id"]}
    )
    assert len(same.json()["employments"]) == 1


async def test_update_other_fields(user_client: AsyncClient) -> None:
    contact = await _post(user_client, "/api/v1/contacts", {"first_name": "A", "last_name": "B"})
    response = await user_client.patch(
        f"/api/v1/contacts/{contact['id']}",
        json={
            "email_work": "A@B.example",
            "email_personal": None,
            "phone_work": " 01 ",
            "linkedin_url": "https://l.example",
            "notes": "n",
            "tag_ids": [],
            "first_name": "Ann",
        },
    )
    body = response.json()
    assert (body["email_work"], body["phone_work"], body["notes"], body["first_name"]) == (
        "a@b.example",
        "01",
        "n",
        "Ann",
    )
    cleared = await user_client.patch(
        f"/api/v1/contacts/{contact['id']}", json={"linkedin_url": None}
    )
    assert cleared.json()["linkedin_url"] is None
    assert (await user_client.get(f"/api/v1/contacts/{uuid.uuid4()}")).status_code == 404


async def test_manual_employment_history(user_client: AsyncClient) -> None:
    bank, _, _ = await _setup(user_client)
    contact = await _post(user_client, "/api/v1/contacts", {"first_name": "A", "last_name": "B"})
    url = f"/api/v1/contacts/{contact['id']}/employments"
    added = await _post(
        user_client,
        url,
        {
            "company_id": bank["id"],
            "job_title": "Intern",
            "start_date": "2020-01-01",
            "end_date": "2020-06-30",
        },
    )
    employment_id = added["employments"][0]["id"]
    wrong = await user_client.post(
        url, json={"company_id": bank["id"], "start_date": "2021-01-01", "end_date": "2020-01-01"}
    )
    assert wrong.status_code == 422
    assert wrong.json()["code"] == "INVALID_DATE_RANGE"

    removed = await user_client.delete(f"{url}/{employment_id}")
    assert removed.json()["employments"] == []
    again = await user_client.delete(f"{url}/{employment_id}")
    assert again.json()["params"] == {"entity": "employment"}
