"""Global search (P11-1, P11-2, ADR-0026, ADR-0040)."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_subjects import create_mission, post

SEARCH = "/api/v1/search"
START, END = "", ""


async def search(client: AsyncClient, q: str, **params: Any) -> list[dict[str, Any]]:
    response = await client.get(SEARCH, params={"q": q, **params})
    assert response.status_code == 200, response.text
    result: list[dict[str, Any]] = response.json()
    return result


def found(results: list[dict[str, Any]]) -> set[tuple[str, str]]:
    return {(r["type"], r["title"]) for r in results}


@pytest.fixture
async def corpus(user_client: AsyncClient) -> dict[str, Any]:
    mission = await create_mission(user_client, "Banque Horizon")
    await post(
        user_client,
        "/api/v1/documents",
        {
            "title": "Migration Kafka",
            "content_md": "Les consommateurs suivent l'élévation de charge. <script>x</script>",
        },
    )
    await post(user_client, "/api/v1/companies", {"name": "Société Générale"})
    await post(user_client, "/api/v1/contacts", {"first_name": "Grace", "last_name": "Hopper"})
    await post(
        user_client, "/api/v1/technologies", {"name": "Kubernetes", "category": "INFRASTRUCTURE"}
    )
    subject = await post(
        user_client,
        "/api/v1/subjects",
        {"title": "Refonte SSO", "scope": "MISSION", "mission_id": mission},
    )
    await post(
        user_client,
        "/api/v1/agenda/tasks",
        {
            "date": "2026-03-02",
            "period": "AM",
            "subject_id": subject["id"],
            "title": "Revue Keycloak",
            "description": "The service runs behind the gateway",
            "duration_minutes": 30,
        },
    )
    await user_client.put(
        "/api/v1/agenda/daily-logs/2026-03-03",
        json={"done": "", "planned": "", "blockers": "VPN indisponible"},
    )
    return {"mission": mission}


async def test_stemming_accents_and_prefixes(
    user_client: AsyncClient, corpus: dict[str, Any]
) -> None:
    assert ("document", "Migration Kafka") in found(await search(user_client, "migrations"))
    assert ("document", "Migration Kafka") in found(await search(user_client, "elevation"))
    assert ("document", "Migration Kafka") in found(await search(user_client, "consom"))
    # English stemming too: "running" finds "runs".
    assert ("task", "Revue Keycloak") in found(await search(user_client, "running"))
    # Every word is required.
    assert ("document", "Migration Kafka") not in found(await search(user_client, "kafka absent"))
    assert ("company", "Société Générale") in found(await search(user_client, "societe generale"))


async def test_typos_on_names(user_client: AsyncClient, corpus: dict[str, Any]) -> None:
    assert ("contact", "Grace Hopper") in found(await search(user_client, "grase hoper"))
    assert ("technology", "Kubernetes") in found(await search(user_client, "kubernets"))


async def test_snippets_dates_types_and_ranking(
    user_client: AsyncClient, corpus: dict[str, Any]
) -> None:
    results = await search(user_client, "consommateurs")
    document = next(r for r in results if r["type"] == "document")
    assert f"{START}consommateurs{END}" in document["snippet"]
    # Content is returned as text: markup stays escaped-free text, never interpreted server-side.
    assert "<b>" not in document["snippet"]
    log = (await search(user_client, "vpn", types=["daily_log"]))[0]
    assert (log["title"], log["date"]) == ("2026-03-03", "2026-03-03")
    task = (await search(user_client, "keycloak", types=["task"]))[0]
    assert task["date"] == "2026-03-02"
    assert {r["type"] for r in await search(user_client, "horizon")} >= {"mission", "company"}
    only = await search(user_client, "horizon", types=["mission"])
    assert {r["type"] for r in only} == {"mission"}
    ranks = [r["rank"] for r in await search(user_client, "kafka")]
    assert ranks == sorted(ranks, reverse=True)
    assert len(await search(user_client, "a", limit=1)) <= 1


async def test_queries_without_words(user_client: AsyncClient, corpus: dict[str, Any]) -> None:
    assert await search(user_client, "!!! & | :*") == []
    assert (await user_client.get(SEARCH, params={"q": ""})).status_code == 422


async def test_search_is_scoped_to_the_owner(
    user_client: AsyncClient, other_client: AsyncClient, corpus: dict[str, Any]
) -> None:
    """ADR-0010: personal data stays private; shared referentials are found by everyone."""
    theirs = found(await search(other_client, "kafka"))
    assert ("document", "Migration Kafka") not in theirs
    assert await search(other_client, "keycloak") == []
    assert ("company", "Société Générale") in found(await search(other_client, "generale"))
