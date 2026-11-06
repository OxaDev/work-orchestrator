"""Graph view support (P9, ADR-0038): Mermaid export, owners, layouts, knowledge graph."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_architecture import ARCH, DOM, REL, domain, world  # noqa: F401
from tests.integration.test_subjects import post


@pytest.fixture
async def system(user_client: AsyncClient, world: dict[str, Any]) -> dict[str, Any]:  # noqa: F811
    """Paiements > {API, Base (target), Batch (deprecated)} in an architecture."""
    bank = world["bank"]
    arch = await post(user_client, ARCH, {"company_id": bank, "name": "SI Bank"})
    pay = await domain(
        user_client, "Paiements", bank, kind="BUSINESS_DOMAIN", architecture_id=arch["id"]
    )
    api = await domain(
        user_client,
        "API",
        bank,
        parent_id=pay["id"],
        kind="SERVICE",
        owner_org_unit_id=world["team"],
    )
    base = await domain(
        user_client, "Base", bank, parent_id=pay["id"], kind="DATABASE", lifecycle="TARGET"
    )
    batch = await domain(user_client, "Batch", bank, parent_id=pay["id"], lifecycle="DEPRECATED")
    await post(
        user_client,
        REL,
        {"source_id": api["id"], "target_id": base["id"], "type": "WRITES_TO", "protocol": "JDBC"},
    )
    await post(
        user_client,
        REL,
        {"source_id": batch["id"], "target_id": api["id"], "type": "CALLS", "sync_mode": "ASYNC"},
    )
    return {
        "arch": arch["id"],
        "pay": pay["id"],
        "api": api["id"],
        "base": base["id"],
        "batch": batch["id"],
    }


async def export(client: AsyncClient, arch: str, **params: Any) -> str:
    response = await client.get(f"{ARCH}/{arch}/mermaid", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, str] = response.json()
    return body["code"]


async def test_mermaid_export_views_and_options(
    user_client: AsyncClient, system: dict[str, Any]
) -> None:
    current = await export(user_client, system["arch"])
    assert current.splitlines()[:2] == ["%% SI Bank", "flowchart LR"]
    # Today: the deprecated batch still runs, the target database does not exist yet.
    assert '"Batch"' in current
    assert '"Base"' not in current
    assert '"appelle"' in current
    assert "-.->" in current
    target = await export(user_client, system["arch"], view="TARGET", lang="en", direction="TB")
    assert "flowchart TB" in target
    assert '"Base"' in target
    assert '"Batch"' not in target
    assert '"writes to (JDBC)"' in target
    both = await export(user_client, system["arch"], view="BOTH")
    assert '"Base"' in both
    assert '"Batch"' in both
    assert "classDef added" in both
    assert any(
        line.startswith("    class ") and line.endswith(" added") for line in both.splitlines()
    )
    assert any(
        line.startswith("    class ") and line.endswith(" removed") for line in both.splitlines()
    )

    services = await export(user_client, system["arch"], kinds=["SERVICE"])
    assert '"API"' in services
    assert '"Paiements"' not in services
    shallow = await export(user_client, system["arch"], depth=0)
    assert '"API"' not in shallow

    mind = (
        await user_client.get(f"{ARCH}/{system['arch']}/mermaid", params={"format": "mindmap"})
    ).json()
    assert mind["format"] == "mindmap"
    assert mind["code"].splitlines()[:2] == ["mindmap", '    root(("`SI Bank`"))']
    bad = await user_client.get(f"{ARCH}/{system['arch']}/mermaid", params={"view": "PAST"})
    assert bad.status_code == 422


async def test_graph_nodes_carry_their_owner(
    user_client: AsyncClient,
    system: dict[str, Any],
    world: dict[str, Any],  # noqa: F811
) -> None:
    graph = (await user_client.get(f"{ARCH}/{system['arch']}/graph")).json()
    owners = {n["name"]: n["owner"] for n in graph["nodes"]}
    assert owners["API"] == {"id": world["team"], "name": "Équipe Cartes"}
    assert owners["Paiements"] is None


async def test_layout_positions(
    user_client: AsyncClient,
    other_client: AsyncClient,
    system: dict[str, Any],
    world: dict[str, Any],  # noqa: F811
) -> None:
    url = f"{ARCH}/{system['arch']}/layout"
    assert (await user_client.get(url)).json() == []
    saved = await user_client.put(
        url, json={"positions": [{"domain_id": system["api"], "x": 10.5, "y": -20}]}
    )
    assert saved.json() == [{"domain_id": system["api"], "x": 10.5, "y": -20.0}]
    moved = await user_client.put(
        url,
        json={
            "positions": [
                {"domain_id": system["api"], "x": 1, "y": 2},
                {"domain_id": system["base"], "x": 3, "y": 4},
            ]
        },
    )
    assert sorted((p["x"], p["y"]) for p in moved.json()) == [(1.0, 2.0), (3.0, 4.0)]
    foreign = await domain(user_client, "CRM", world["insurer"])
    wrong = await user_client.put(
        url, json={"positions": [{"domain_id": foreign["id"], "x": 0, "y": 0}]}
    )
    assert wrong.status_code == 404
    assert (await other_client.get(url)).status_code == 404
    assert (await user_client.delete(url)).status_code == 204
    assert (await user_client.get(url)).json() == []
    # Positions go with their domain.
    await user_client.put(url, json={"positions": [{"domain_id": system["batch"], "x": 0, "y": 0}]})
    await user_client.delete(f"{DOM}/{system['batch']}")
    assert (await user_client.get(url)).json() == []


async def test_knowledge_graph(
    user_client: AsyncClient,
    other_client: AsyncClient,
    system: dict[str, Any],
    world: dict[str, Any],  # noqa: F811
) -> None:
    glossary = await post(user_client, "/api/v1/documents", {"title": "Glossaire"})
    await post(
        user_client,
        "/api/v1/documents",
        {
            "title": "Architecture",
            "content_md": (
                f"[[domain:{system['api']}|l'API]] [[document:{glossary['id']}|glossaire]] "
                "[[company:0190a8c4-0000-7000-8000-000000000009|disparue]]"
            ),
            "attach_to": {"type": "mission", "id": world["mission"]},
        },
    )
    await post(user_client, "/api/v1/documents", {"title": "Seule"})
    graph = (await user_client.get("/api/v1/links/graph")).json()
    nodes = {(n["type"], n["label"]) for n in graph["nodes"]}
    assert nodes == {
        ("document", "Architecture"),
        ("document", "Glossaire"),
        ("document", "Seule"),
        ("domain", "API"),
        ("mission", "Bank — Dev"),
    }
    edges = {(e["target_type"], e["kind"]) for e in graph["edges"]}
    # The dangling company link is left out.
    assert edges == {("domain", "LINK"), ("document", "LINK"), ("mission", "ATTACHMENT")}
    assert (await other_client.get("/api/v1/links/graph")).json() == {"nodes": [], "edges": []}
