"""Documents (P7, ADR-0024, ADR-0036): versions, drafts, tree, links, backlinks, isolation."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.test_subjects import create_mission, post

DOCS = "/api/v1/documents"


async def document(client: AsyncClient, title: str, **fields: Any) -> dict[str, Any]:
    return await post(client, DOCS, {"title": title, **fields})


@pytest.fixture
async def mission_id(user_client: AsyncClient) -> str:
    return await create_mission(user_client)


async def test_create_save_versions_and_restore(user_client: AsyncClient) -> None:
    created = await document(user_client, " Fiche : Paiements ", content_md="v1")
    assert (created["title"], created["slug"], created["version_count"]) == (
        "Fiche : Paiements",
        "fiche-paiements",
        1,
    )
    url = f"{DOCS}/{created['id']}"
    saved = (
        await user_client.put(url, json={"title": "Fiche Paiements", "content_md": "v2"})
    ).json()
    assert (saved["version_count"], saved["content_md"], saved["slug"]) == (
        2,
        "v2",
        "fiche-paiements",
    )
    same = (
        await user_client.put(url, json={"title": "Fiche Paiements", "content_md": "v2"})
    ).json()
    assert same["version_count"] == 2  # nothing changed, no version

    versions = (await user_client.get(f"{url}/versions")).json()
    assert [v["number"] for v in versions] == [2, 1]
    first = (await user_client.get(f"{url}/versions/1")).json()
    assert (first["title"], first["content_md"]) == ("Fiche : Paiements", "v1")
    assert (await user_client.get(f"{url}/versions/9")).status_code == 404

    restored = (await user_client.post(f"{url}/versions/1/restore")).json()
    assert (restored["content_md"], restored["version_count"]) == ("v1", 3)

    twin = await document(user_client, "Fiche : paiements")
    assert twin["slug"] == "fiche-paiements-2"


async def test_draft_autosave_creates_no_version(user_client: AsyncClient) -> None:
    created = await document(user_client, "Notes", content_md="saved")
    url = f"{DOCS}/{created['id']}"
    draft = (await user_client.put(f"{url}/draft", json={"content_md": "typing…"})).json()
    assert (draft["draft_md"], draft["has_draft"], draft["content_md"]) == (
        "typing…",
        True,
        "saved",
    )
    assert draft["draft_saved_at"] is not None
    assert draft["version_count"] == 1
    discarded = (await user_client.delete(f"{url}/draft")).json()
    assert (discarded["draft_md"], discarded["has_draft"]) == (None, False)
    await user_client.put(f"{url}/draft", json={"content_md": "again"})
    saved = (await user_client.put(url, json={"title": "Notes", "content_md": "again"})).json()
    assert (saved["draft_md"], saved["version_count"]) == (None, 2)


async def test_templates_and_parent_tree(user_client: AsyncClient) -> None:
    templates = (await user_client.get("/api/v1/document-templates")).json()
    template = (
        templates[0]
        if templates
        else await post(
            user_client,
            "/api/v1/document-templates",
            {"name_fr": "Réunion", "name_en": "Meeting", "content_md": "# Réunion"},
        )
    )
    root = await document(user_client, "Mission", template_id=template["id"])
    assert root["content_md"] == template["content_md"]
    child = await document(user_client, "Annexe", parent_id=root["id"])
    grandchild = await document(user_client, "Détail", parent_id=child["id"])

    cycle = await user_client.post(
        f"{DOCS}/{root['id']}/move", json={"parent_id": grandchild["id"]}
    )
    assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"
    moved = await user_client.post(f"{DOCS}/{grandchild['id']}/move", json={"parent_id": None})
    assert moved.json()["parent_id"] is None

    await user_client.post(f"{DOCS}/{root['id']}/archive")
    listed = {d["title"] for d in (await user_client.get(DOCS)).json()}
    assert listed == {"Détail"}  # the archived page and its sub-page are hidden
    with_archived = (await user_client.get(DOCS, params={"include_archived": True})).json()
    assert len(with_archived) == 3
    await user_client.post(f"{DOCS}/{root['id']}/restore")
    assert len((await user_client.get(DOCS, params={"q": "ANN"})).json()) == 1
    assert (await user_client.delete(f"{DOCS}/{child['id']}")).status_code == 204


async def test_rg17_deleting_a_page_deletes_its_sub_pages(user_client: AsyncClient) -> None:
    """RG-17: deleting a page deletes its whole subtree, versions included."""
    root = await document(user_client, "Racine")
    child = await document(user_client, "Enfant", parent_id=root["id"])
    grandchild = await document(user_client, "Petit-enfant", parent_id=child["id"])
    sibling = await document(user_client, "Voisine", parent_id=root["id"])
    other = await document(user_client, "Autre")
    saved = await user_client.put(
        f"{DOCS}/{grandchild['id']}", json={"title": "Petit-enfant", "content_md": "v1"}
    )
    assert saved.status_code == 200

    assert (await user_client.delete(f"{DOCS}/{child['id']}")).status_code == 204
    assert (await user_client.get(f"{DOCS}/{grandchild['id']}")).status_code == 404
    assert (await user_client.get(f"{DOCS}/{sibling['id']}")).status_code == 200

    assert (await user_client.delete(f"{DOCS}/{root['id']}")).status_code == 204
    remaining = {d["id"] for d in (await user_client.get(DOCS)).json()}
    assert remaining == {other["id"]}


async def test_wikilinks_backlinks_and_attachments(
    user_client: AsyncClient, mission_id: str
) -> None:
    company = await post(user_client, "/api/v1/companies", {"name": "Acme"})
    target = await document(user_client, "Glossaire")
    source = await document(
        user_client,
        "Architecture",
        content_md=(
            f"Voir [[mission:{mission_id}|la mission]], [[document:{target['id']}|le glossaire]]"
            f" et [[company:{company['id']}|Acme]].\n"
            f"`[[document:{target['id']}|en code]]`\n"
            "[[domain:0190a8c4-0000-7000-8000-000000000009|Paiements]]"
        ),
    )
    links = {(link["type"], link["label"]) for link in source["links"]}
    # Labels are the entities' current names; unknown targets (P8 domains) have none.
    assert links == {
        ("mission", "Bank — Dev"),
        ("document", "Glossaire"),
        ("company", "Acme"),
        ("domain", None),
    }

    backlinks = (
        await user_client.get("/api/v1/backlinks", params={"type": "document", "id": target["id"]})
    ).json()
    assert [(b["document"]["title"], b["label"]) for b in backlinks] == [
        ("Architecture", "le glossaire")
    ]
    # Saving without the link removes the backlink.
    await user_client.put(
        f"{DOCS}/{source['id']}", json={"title": "Architecture", "content_md": ""}
    )
    assert (
        await user_client.get("/api/v1/backlinks", params={"type": "document", "id": target["id"]})
    ).json() == []

    attached = await user_client.put(f"{DOCS}/{target['id']}/entities/mission/{mission_id}")
    assert attached.json()["entities"] == [
        {"type": "mission", "id": mission_id, "label": "Bank — Dev"}
    ]
    await user_client.put(f"{DOCS}/{target['id']}/entities/mission/{mission_id}")  # idempotent
    on_mission = (
        await user_client.get(DOCS, params={"entity_type": "mission", "entity_id": mission_id})
    ).json()
    assert [d["id"] for d in on_mission] == [target["id"]]
    created_on = await document(
        user_client, "CR kick-off", attach_to={"type": "company", "id": company["id"]}
    )
    assert created_on["entities"][0]["label"] == "Acme"
    # Domains are linkable since P8 (ADR-0037): an unknown one is simply not found.
    unknown_domain = await user_client.put(
        f"{DOCS}/{target['id']}/entities/domain/0190a8c4-0000-7000-8000-000000000009"
    )
    assert unknown_domain.status_code == 404
    missing = await user_client.put(
        f"{DOCS}/{target['id']}/entities/company/0190a8c4-0000-7000-8000-000000000009"
    )
    assert missing.status_code == 404
    detached = await user_client.delete(f"{DOCS}/{target['id']}/entities/mission/{mission_id}")
    assert detached.json()["entities"] == []
    again = await user_client.delete(f"{DOCS}/{target['id']}/entities/mission/{mission_id}")
    assert again.status_code == 404


async def test_link_search(user_client: AsyncClient, mission_id: str) -> None:
    await document(user_client, "Bank architecture")
    await post(user_client, "/api/v1/contacts", {"first_name": "Banky", "last_name": "Doe"})
    found = (await user_client.get("/api/v1/links/search", params={"q": "bank"})).json()
    kinds = {(r["type"], r["label"]) for r in found}
    assert {("document", "Bank architecture"), ("contact", "Banky Doe")} <= kinds
    assert ("mission", "Bank — Dev") in kinds
    only = (
        await user_client.get("/api/v1/links/search", params={"q": "bank", "types": ["mission"]})
    ).json()
    assert [r["id"] for r in only] == [mission_id]


async def test_document_templates_referential(user_client: AsyncClient) -> None:
    url = "/api/v1/document-templates"
    created = await post(
        user_client, url, {"name_fr": "Démo", "name_en": "Demo", "content_md": "x"}
    )
    duplicate = await user_client.post(url, json={"name_fr": "demo", "name_en": "y"})
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"
    updated = await user_client.patch(f"{url}/{created['id']}", json={"content_md": "# New"})
    assert updated.json()["content_md"] == "# New"
    assert (await user_client.delete(f"{url}/{created['id']}")).status_code == 204
    assert (await user_client.patch(f"{url}/{created['id']}", json={})).status_code == 404


async def test_documents_are_private(
    user_client: AsyncClient, other_client: AsyncClient, mission_id: str
) -> None:
    """ADR-0010: other users neither see, change nor link to someone's documents."""
    mine = await document(user_client, "Secret", content_md=f"[[mission:{mission_id}|mission]]")
    url = f"{DOCS}/{mine['id']}"
    assert (await other_client.get(DOCS)).json() == []
    for response in (
        await other_client.get(url),
        await other_client.put(url, json={"title": "x", "content_md": ""}),
        await other_client.put(f"{url}/draft", json={"content_md": ""}),
        await other_client.get(f"{url}/versions"),
        await other_client.post(f"{url}/archive"),
        await other_client.delete(url),
        await other_client.post(DOCS, json={"title": "Child", "parent_id": mine["id"]}),
        await other_client.post(
            DOCS, json={"title": "On mission", "attach_to": {"type": "mission", "id": mission_id}}
        ),
    ):
        assert response.status_code == 404, response.text
    theirs = await document(other_client, "Theirs", content_md=f"[[mission:{mission_id}|x]]")
    # A foreign target shows no label, and does not leak into the owner's backlinks.
    assert theirs["links"][0]["label"] is None
    backlinks = (
        await user_client.get("/api/v1/backlinks", params={"type": "mission", "id": mission_id})
    ).json()
    assert [b["document"]["title"] for b in backlinks] == ["Secret"]
    search = (await other_client.get("/api/v1/links/search", params={"q": "secret"})).json()
    assert search == []


async def test_versions_are_paged(user_client: AsyncClient) -> None:
    """Every save adds a version: the history is read newest first, a page at a time (P12-2)."""
    document = await post(user_client, "/api/v1/documents", {"title": "Paged"})
    url = f"/api/v1/documents/{document['id']}"
    for text in ("one", "two"):
        saved = await user_client.put(url, json={"title": "Paged", "content_md": text})
        assert saved.status_code == 200, saved.text
    first = (await user_client.get(f"{url}/versions", params={"limit": 2})).json()
    rest = (await user_client.get(f"{url}/versions", params={"limit": 2, "offset": 2})).json()
    assert [v["number"] for v in first + rest] == [3, 2, 1]
