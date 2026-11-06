"""Architectures and domains (P8, ADR-0022, ADR-0023, ADR-0037)."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_subjects import post

ARCH = "/api/v1/architectures"
DOM = "/api/v1/domains"
REL = "/api/v1/domain-relations"
LINKS = "/api/v1/external-links"


@pytest.fixture
async def world(user_client: AsyncClient) -> dict[str, Any]:
    """Two clients, an ESN, a mission at the bank, an org chart at the bank."""
    bank = await post(user_client, "/api/v1/companies", {"name": "Bank"})
    insurer = await post(user_client, "/api/v1/companies", {"name": "Insurer"})
    esn = await post(user_client, "/api/v1/companies", {"name": "ESN", "types": ["ESN"]})
    mission = await post(
        user_client,
        "/api/v1/missions",
        {
            "title": "Bank — Dev",
            "job_title": "Dev",
            "client_id": bank["id"],
            "employer_company_id": esn["id"],
            "start_date": "2026-01-05",
        },
    )
    units = f"/api/v1/companies/{bank['id']}/org-units"
    dsi = await post(user_client, units, {"name": "DSI", "level_label": "Direction"})
    pole = await post(
        user_client,
        units,
        {"name": "Pôle Paiements", "level_label": "Pôle", "parent_id": dsi["id"]},
    )
    team = await post(
        user_client,
        units,
        {"name": "Équipe Cartes", "level_label": "Équipe", "parent_id": pole["id"]},
    )
    return {
        "bank": bank["id"],
        "insurer": insurer["id"],
        "mission": mission["id"],
        "team": team["id"],
    }


async def domain(client: AsyncClient, name: str, company: str, **fields: Any) -> dict[str, Any]:
    return await post(
        client, DOM, {"name": name, "company_id": company, "kind": "APPLICATION", **fields}
    )


async def test_architectures_and_missions(user_client: AsyncClient, world: dict[str, Any]) -> None:
    created = await post(
        user_client,
        ARCH,
        {"company_id": world["bank"], "name": "SI Bank", "mission_id": world["mission"]},
    )
    assert created["missions"] == [{"id": world["mission"], "name": "Bank — Dev"}]
    assert (created["company"]["name"], created["member_count"], created["lifecycle"]) == (
        "Bank",
        0,
        "CURRENT",
    )
    duplicate = await user_client.post(ARCH, json={"company_id": world["bank"], "name": "si bank"})
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"
    # Same name at another client is fine.
    other = await post(user_client, ARCH, {"company_id": world["insurer"], "name": "SI Bank"})
    wrong = await user_client.put(f"{ARCH}/{other['id']}/missions/{world['mission']}")
    assert wrong.status_code == 422
    assert wrong.json()["code"] == "ARCHITECTURE_COMPANY_MISMATCH"
    on_creation = await user_client.post(
        ARCH, json={"company_id": world["insurer"], "name": "X", "mission_id": world["mission"]}
    )
    assert on_creation.json()["code"] == "ARCHITECTURE_COMPANY_MISMATCH"

    by_mission = (await user_client.get(ARCH, params={"mission_id": world["mission"]})).json()
    assert [a["id"] for a in by_mission] == [created["id"]]
    by_company = (await user_client.get(ARCH, params={"company_id": world["insurer"]})).json()
    assert [a["id"] for a in by_company] == [other["id"]]

    url = f"{ARCH}/{created['id']}"
    unlinked = await user_client.delete(f"{url}/missions/{world['mission']}")
    assert unlinked.json()["missions"] == []
    assert (await user_client.delete(f"{url}/missions/{world['mission']}")).status_code == 404
    relinked = await user_client.put(f"{url}/missions/{world['mission']}")
    assert len(relinked.json()["missions"]) == 1
    patched = await user_client.patch(url, json={"description": "# SI", "lifecycle": "TARGET"})
    assert (patched.json()["description"], patched.json()["lifecycle"]) == ("# SI", "TARGET")
    await user_client.post(f"{url}/archive")
    assert len((await user_client.get(ARCH)).json()) == 1
    await user_client.post(f"{url}/restore")

    member = await domain(user_client, "Paiements", world["bank"], architecture_id=created["id"])
    assert (await user_client.get(url)).json()["members"][0]["id"] == member["id"]
    assert (await user_client.delete(url)).status_code == 204
    # The domains belong to the client, not to the architecture (ADR-0023).
    assert (await user_client.get(f"{DOM}/{member['id']}")).status_code == 200


async def test_domain_tree_rules(user_client: AsyncClient, world: dict[str, Any]) -> None:
    bank = world["bank"]
    root = await domain(user_client, "Paiements", bank, kind="BUSINESS_DOMAIN")
    app = await domain(user_client, "Hub", bank, parent_id=root["id"])
    api = await domain(user_client, "API", bank, parent_id=app["id"], kind="SERVICE")
    # Sibling names are unique; the same name elsewhere is fine.
    twin = await user_client.post(
        DOM, json={"name": "hub", "company_id": bank, "kind": "SERVICE", "parent_id": root["id"]}
    )
    assert twin.json()["code"] == "NAME_ALREADY_USED"
    await domain(user_client, "API", bank, parent_id=root["id"])
    cross = await user_client.post(
        DOM,
        json={
            "name": "X",
            "company_id": world["insurer"],
            "kind": "SERVICE",
            "parent_id": root["id"],
        },
    )
    assert cross.json()["code"] == "DOMAIN_COMPANY_MISMATCH"

    for target in (api["id"], root["id"]):  # RG-08: itself or a descendant
        cycle = await user_client.patch(f"{DOM}/{root['id']}", json={"parent_id": target})
        assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"
    moved = await user_client.patch(f"{DOM}/{app['id']}", json={"parent_id": None})
    assert moved.json()["parent_id"] is None
    # The subtree moved with it.
    descendants = (await user_client.get(f"{DOM}/{app['id']}/descendants")).json()
    assert [d["name"] for d in descendants] == ["API"]
    await user_client.patch(f"{DOM}/{app['id']}", json={"parent_id": root["id"]})
    ancestors = (await user_client.get(f"{DOM}/{api['id']}/ancestors")).json()
    assert [d["name"] for d in ancestors] == ["Paiements", "Hub"]

    detail = (await user_client.get(f"{DOM}/{api['id']}")).json()
    assert [d["name"] for d in detail["ancestors"]] == ["Paiements", "Hub"]
    root_detail = (await user_client.get(f"{DOM}/{root['id']}")).json()
    assert sorted(c["name"] for c in root_detail["children"]) == ["API", "Hub"]

    refused = await user_client.delete(f"{DOM}/{root['id']}")
    assert refused.json()["params"] == {"entity": "domain", "referencedBy": "domain"}
    await user_client.post(f"{DOM}/{root['id']}/archive")
    assert (await user_client.get(DOM, params={"company_id": bank})).json() == []
    await user_client.post(f"{DOM}/{root['id']}/restore")
    assert len((await user_client.get(DOM, params={"q": "api"})).json()) == 2


async def test_owner_chain_contact_and_org_unit_guard(
    user_client: AsyncClient, world: dict[str, Any]
) -> None:
    contact = await post(user_client, "/api/v1/contacts", {"first_name": "Ada", "last_name": "L"})
    cards = await domain(
        user_client,
        "Cartes",
        world["bank"],
        owner_org_unit_id=world["team"],
        referent_contact_id=contact["id"],
        criticality="CRITICAL",
    )
    assert [u["name"] for u in cards["owner_chain"]] == ["DSI", "Pôle Paiements", "Équipe Cartes"]
    assert cards["owner_org_unit"]["level_label"] == "Équipe"
    assert cards["referent_contact"]["name"] == "Ada L"
    elsewhere = await user_client.post(
        DOM,
        json={
            "name": "X",
            "company_id": world["insurer"],
            "kind": "OTHER",
            "owner_org_unit_id": world["team"],
        },
    )
    assert elsewhere.json()["code"] == "DOMAIN_COMPANY_MISMATCH"
    guarded = await user_client.delete(f"/api/v1/org-units/{world['team']}")
    assert guarded.json()["params"] == {"entity": "orgUnit", "referencedBy": "domain"}
    cleared = await user_client.patch(
        f"{DOM}/{cards['id']}", json={"owner_org_unit_id": None, "criticality": None}
    )
    assert (cleared.json()["owner_chain"], cleared.json()["criticality"]) == ([], None)


async def test_relations_rg09(user_client: AsyncClient, world: dict[str, Any]) -> None:
    api = await domain(user_client, "API", world["bank"])
    db = await domain(user_client, "Base", world["bank"], kind="DATABASE")
    foreign = await domain(user_client, "CRM", world["insurer"])
    self_ = await user_client.post(
        REL, json={"source_id": api["id"], "target_id": api["id"], "type": "CALLS"}
    )
    assert self_.json()["code"] == "RELATION_SELF"
    cross = await user_client.post(
        REL, json={"source_id": api["id"], "target_id": foreign["id"], "type": "CALLS"}
    )
    assert cross.json()["code"] == "DOMAIN_COMPANY_MISMATCH"
    custom = await user_client.post(
        REL, json={"source_id": api["id"], "target_id": db["id"], "type": "CUSTOM"}
    )
    assert custom.json()["code"] == "RELATION_LABEL_REQUIRED"

    relation = await post(
        user_client,
        REL,
        {
            "source_id": api["id"],
            "target_id": db["id"],
            "type": "WRITES_TO",
            "protocol": " JDBC ",
            "sync_mode": "SYNC",
        },
    )
    assert (relation["source"]["name"], relation["target"]["kind"], relation["protocol"]) == (
        "API",
        "DATABASE",
        "JDBC",
    )
    updated = await user_client.patch(
        f"{REL}/{relation['id']}",
        json={"type": "CUSTOM", "label": "réplique", "lifecycle": "TARGET"},
    )
    assert (updated.json()["type"], updated.json()["label"], updated.json()["lifecycle"]) == (
        "CUSTOM",
        "réplique",
        "TARGET",
    )
    loop = await user_client.patch(f"{REL}/{relation['id']}", json={"target_id": api["id"]})
    assert loop.json()["code"] == "RELATION_SELF"
    api_detail = (await user_client.get(f"{DOM}/{api['id']}")).json()
    db_detail = (await user_client.get(f"{DOM}/{db['id']}")).json()
    assert [r["id"] for r in api_detail["outgoing"]] == [relation["id"]]
    assert api_detail["incoming"] == []
    assert [r["source"]["name"] for r in db_detail["incoming"]] == ["API"]
    assert (await user_client.delete(f"{REL}/{relation['id']}")).status_code == 204


async def test_membership_and_graph(user_client: AsyncClient, world: dict[str, Any]) -> None:
    bank = world["bank"]
    arch = await post(user_client, ARCH, {"company_id": bank, "name": "SI"})
    pay = await domain(user_client, "Paiements", bank, kind="BUSINESS_DOMAIN")
    hub = await domain(user_client, "Hub", bank, parent_id=pay["id"])
    api = await domain(user_client, "API", bank, parent_id=hub["id"], kind="SERVICE")
    db = await domain(
        user_client, "Base", bank, parent_id=hub["id"], kind="DATABASE", lifecycle="TARGET"
    )
    outside = await domain(user_client, "CRM", bank)
    foreign = await domain(user_client, "Ext", world["insurer"])
    await post(
        user_client, REL, {"source_id": api["id"], "target_id": db["id"], "type": "WRITES_TO"}
    )
    await post(
        user_client, REL, {"source_id": api["id"], "target_id": outside["id"], "type": "CALLS"}
    )

    url = f"{ARCH}/{arch['id']}"
    mismatch = await user_client.put(f"{url}/domains/{foreign['id']}")
    assert mismatch.json()["code"] == "DOMAIN_COMPANY_MISMATCH"
    await user_client.put(f"{url}/domains/{pay['id']}")
    await user_client.put(f"{url}/domains/{pay['id']}")  # idempotent
    assert (await user_client.get(url)).json()["member_count"] == 1

    graph = (await user_client.get(f"{url}/graph")).json()
    nodes = {n["name"]: n for n in graph["nodes"]}
    # Members and their whole subtree; CRM is outside the architecture.
    assert set(nodes) == {"Paiements", "Hub", "API", "Base"}
    assert (nodes["Paiements"]["member"], nodes["Paiements"]["depth"]) == (True, 0)
    assert (nodes["API"]["parent_id"], nodes["API"]["depth"], nodes["API"]["member"]) == (
        hub["id"],
        2,
        False,
    )
    # Only relations between two nodes of the graph.
    assert [(e["source_id"], e["target_id"]) for e in graph["edges"]] == [(api["id"], db["id"])]

    shallow = (await user_client.get(f"{url}/graph", params={"depth": 1})).json()
    assert {n["name"] for n in shallow["nodes"]} == {"Paiements", "Hub"}
    assert shallow["edges"] == []
    services = (
        await user_client.get(f"{url}/graph", params={"kinds": ["BUSINESS_DOMAIN", "SERVICE"]})
    ).json()
    # Hub is hidden: API hangs on the nearest kept ancestor.
    assert {n["name"]: n["parent_id"] for n in services["nodes"]} == {
        "Paiements": None,
        "API": pay["id"],
    }
    current = (await user_client.get(f"{url}/graph", params={"lifecycles": ["CURRENT"]})).json()
    assert "Base" not in {n["name"] for n in current["nodes"]}
    no_edges = (await user_client.get(f"{url}/graph", params={"include_relations": False})).json()
    assert no_edges["edges"] == []
    # Archived sub-domains leave the graph with their subtree.
    await user_client.post(f"{DOM}/{hub['id']}/archive")
    assert [n["name"] for n in (await user_client.get(f"{url}/graph")).json()["nodes"]] == [
        "Paiements"
    ]
    await user_client.post(f"{DOM}/{hub['id']}/restore")

    # A domain lists the architectures holding it, directly or through an ancestor.
    assert [
        a["name"] for a in (await user_client.get(f"{DOM}/{api['id']}")).json()["architectures"]
    ] == ["SI"]
    removed = await user_client.delete(f"{url}/domains/{pay['id']}")
    assert removed.json()["members"] == []
    assert (await user_client.delete(f"{url}/domains/{pay['id']}")).status_code == 404


async def test_technologies_subjects_tasks_and_documents(
    user_client: AsyncClient, world: dict[str, Any]
) -> None:
    kafka = await post(
        user_client, "/api/v1/technologies", {"name": "Kafka X", "category": "MESSAGING"}
    )
    bus = await domain(user_client, "Bus", world["bank"], kind="MESSAGING")
    url = f"{DOM}/{bus['id']}"
    with_tech = await user_client.put(
        f"{url}/technologies/{kafka['id']}", json={"version": " 3.7 "}
    )
    assert with_tech.json()["technologies"] == [
        {
            "technology": {"id": kafka["id"], "name": "Kafka X"},
            "category": "MESSAGING",
            "version": "3.7",
        }
    ]
    assert (await user_client.delete(f"{url}/technologies/{kafka['id']}")).json()[
        "technologies"
    ] == []

    mission_subject = await post(
        user_client,
        "/api/v1/subjects",
        {"title": "Migration", "scope": "MISSION", "mission_id": world["mission"]},
    )
    linked = await user_client.put(f"{url}/subjects/{mission_subject['id']}")
    assert [s["title"] for s in linked.json()["subjects"]] == ["Migration"]
    foreign_domain = await domain(user_client, "CRM", world["insurer"])
    refused = await user_client.put(
        f"{DOM}/{foreign_domain['id']}/subjects/{mission_subject['id']}"
    )
    assert refused.json()["code"] == "DOMAIN_COMPANY_MISMATCH"
    personal = await post(user_client, "/api/v1/subjects", {"title": "Veille", "scope": "PERSONAL"})
    assert (
        await user_client.put(f"{DOM}/{foreign_domain['id']}/subjects/{personal['id']}")
    ).status_code == 200

    await post(
        user_client,
        "/api/v1/agenda/tasks",
        {
            "date": "2026-03-02",
            "period": "AM",
            "subject_id": mission_subject["id"],
            "title": "Topics",
            "duration_minutes": 60,
        },
    )
    tasks = (await user_client.get(f"{url}/tasks")).json()
    assert [t["title"] for t in tasks] == ["Topics"]
    assert (await user_client.delete(f"{url}/subjects/{mission_subject['id']}")).json()[
        "subjects"
    ] == []
    assert (await user_client.get(f"{url}/tasks")).json() == []

    # Documents can now point to domains and architectures (ADR-0036).
    doc = await post(
        user_client,
        "/api/v1/documents",
        {
            "title": "Fiche",
            "content_md": f"[[domain:{bus['id']}|le bus]]",
            "attach_to": {"type": "domain", "id": bus["id"]},
        },
    )
    assert doc["links"] == [{"type": "domain", "id": bus["id"], "label": "Bus"}]
    assert doc["entities"] == [{"type": "domain", "id": bus["id"], "label": "Bus"}]
    found = (
        await user_client.get("/api/v1/links/search", params={"q": "bus", "types": ["domain"]})
    ).json()
    assert [r["id"] for r in found] == [bus["id"]]


async def test_external_links(user_client: AsyncClient, world: dict[str, Any]) -> None:
    app = await domain(user_client, "App", world["bank"])
    created = await post(
        user_client,
        LINKS,
        {
            "entity_type": "DOMAIN",
            "entity_id": app["id"],
            "kind": "REPOSITORY",
            "label": "Git",
            "url": "https://git.example.com/app",
        },
    )
    assert created["url"] == "https://git.example.com/app"
    bad = await user_client.post(
        LINKS,
        json={"entity_type": "DOMAIN", "entity_id": app["id"], "label": "x", "url": "not a url"},
    )
    assert bad.status_code == 422
    patched = await user_client.patch(
        f"{LINKS}/{created['id']}", json={"label": "GitLab", "kind": "OTHER"}
    )
    assert (patched.json()["label"], patched.json()["kind"]) == ("GitLab", "OTHER")
    assert [
        link["label"]
        for link in (await user_client.get(f"{DOM}/{app['id']}")).json()["external_links"]
    ] == ["GitLab"]

    on_mission = await post(
        user_client,
        LINKS,
        {
            "entity_type": "MISSION",
            "entity_id": world["mission"],
            "kind": "TICKETS",
            "label": "Jira",
            "url": "https://jira.example.com",
        },
    )
    listed = (
        await user_client.get(
            LINKS, params={"entity_type": "MISSION", "entity_id": world["mission"]}
        )
    ).json()
    assert [link["id"] for link in listed] == [on_mission["id"]]
    subject = await post(user_client, "/api/v1/subjects", {"title": "S", "scope": "PERSONAL"})
    await post(
        user_client,
        LINKS,
        {
            "entity_type": "SUBJECT",
            "entity_id": subject["id"],
            "label": "Ticket",
            "url": "https://jira.example.com/1",
        },
    )
    await user_client.delete(f"/api/v1/subjects/{subject['id']}")
    assert (
        await user_client.get(LINKS, params={"entity_type": "SUBJECT", "entity_id": subject["id"]})
    ).json() == []
    missing = await user_client.post(
        LINKS,
        json={
            "entity_type": "SUBJECT",
            "entity_id": subject["id"],
            "label": "x",
            "url": "https://x.org",
        },
    )
    assert missing.status_code == 404
    assert (await user_client.delete(f"{LINKS}/{created['id']}")).status_code == 204


async def test_domain_deletion_cascades(user_client: AsyncClient, world: dict[str, Any]) -> None:
    api = await domain(user_client, "API", world["bank"])
    db = await domain(user_client, "Base", world["bank"])
    await post(user_client, REL, {"source_id": api["id"], "target_id": db["id"], "type": "CALLS"})
    await post(
        user_client,
        LINKS,
        {
            "entity_type": "DOMAIN",
            "entity_id": db["id"],
            "label": "Git",
            "url": "https://git.example.com",
        },
    )
    doc = await post(
        user_client,
        "/api/v1/documents",
        {"title": "Doc", "attach_to": {"type": "domain", "id": db["id"]}},
    )
    assert (await user_client.delete(f"{DOM}/{db['id']}")).status_code == 204
    assert (await user_client.get(f"{DOM}/{api['id']}")).json()["outgoing"] == []
    assert (
        await user_client.get(LINKS, params={"entity_type": "DOMAIN", "entity_id": db["id"]})
    ).json() == []
    assert (await user_client.get(f"/api/v1/documents/{doc['id']}")).json()["entities"] == []


async def test_architecture_is_private(
    user_client: AsyncClient, other_client: AsyncClient, world: dict[str, Any]
) -> None:
    """ADR-0010: architectures and domains are personal; companies are shared."""
    arch = await post(user_client, ARCH, {"company_id": world["bank"], "name": "SI"})
    mine = await domain(user_client, "API", world["bank"])
    assert (await other_client.get(ARCH)).json() == []
    assert (await other_client.get(DOM)).json() == []
    for response in (
        await other_client.get(f"{ARCH}/{arch['id']}"),
        await other_client.get(f"{ARCH}/{arch['id']}/graph"),
        await other_client.put(f"{ARCH}/{arch['id']}/domains/{mine['id']}"),
        await other_client.get(f"{DOM}/{mine['id']}"),
        await other_client.patch(f"{DOM}/{mine['id']}", json={"name": "x"}),
        await other_client.delete(f"{DOM}/{mine['id']}"),
        await other_client.post(
            DOM,
            json={
                "name": "x",
                "company_id": world["bank"],
                "kind": "OTHER",
                "parent_id": mine["id"],
            },
        ),
        await other_client.post(
            LINKS,
            json={
                "entity_type": "DOMAIN",
                "entity_id": mine["id"],
                "label": "x",
                "url": "https://x.org",
            },
        ),
    ):
        assert response.status_code == 404, response.text
    theirs = await domain(other_client, "Theirs", world["bank"])
    stolen = await other_client.post(
        REL, json={"source_id": theirs["id"], "target_id": mine["id"], "type": "CALLS"}
    )
    assert stolen.status_code == 404
    # Same name, same company, other owner: allowed (personal data).
    assert (
        await other_client.post(ARCH, json={"company_id": world["bank"], "name": "SI"})
    ).status_code == 201
