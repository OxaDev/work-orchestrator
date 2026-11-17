"""Projects between missions and their documents and architectures (ADR-0042): RG-15, RG-16."""

from httpx import AsyncClient

from tests.integration.test_subjects import create_mission, post

PROJECTS = "/api/v1/projects"
DOCS = "/api/v1/documents"


async def test_project_crud_and_names(user_client: AsyncClient) -> None:
    mission = await create_mission(user_client)
    other_mission = await create_mission(user_client, "Insurer — Dev")
    created = await post(
        user_client, PROJECTS, {"mission_id": mission, "name": "Paiements", "description": "x"}
    )
    assert (created["mission"]["id"], created["client"]["name"]) == (mission, "Client Bank — Dev")
    assert (created["document_count"], created["architecture_count"]) == (0, 0)
    duplicate = await user_client.post(PROJECTS, json={"mission_id": mission, "name": "paiements"})
    assert duplicate.json()["code"] == "NAME_ALREADY_USED"
    # Same name in another mission is fine.
    await post(user_client, PROJECTS, {"mission_id": other_mission, "name": "Paiements"})
    second = await post(user_client, PROJECTS, {"mission_id": mission, "name": "Cartes"})

    listed = (await user_client.get(PROJECTS, params={"mission_id": mission})).json()
    assert [p["name"] for p in listed["items"]] == ["Cartes", "Paiements"]
    assert listed["total"] == 2

    url = f"{PROJECTS}/{created['id']}"
    renamed = await user_client.patch(url, json={"name": "Paiements SEPA"})
    assert renamed.json()["name"] == "Paiements SEPA"
    clash = await user_client.patch(url, json={"name": "Cartes"})
    assert clash.status_code == 409
    await user_client.post(f"{url}/archive")
    active = (await user_client.get(PROJECTS, params={"mission_id": mission})).json()
    assert [p["id"] for p in active["items"]] == [second["id"]]
    await user_client.post(f"{url}/restore")
    assert (await user_client.delete(f"{PROJECTS}/{second['id']}")).status_code == 204
    assert (await user_client.get(f"{PROJECTS}/{second['id']}")).status_code == 404


async def test_documents_follow_their_tree_project(user_client: AsyncClient) -> None:
    """RG-15: a sub-page always carries its root's project; moves carry the whole subtree."""
    mission = await create_mission(user_client)
    alpha = await post(user_client, PROJECTS, {"mission_id": mission, "name": "Alpha"})
    beta = await post(user_client, PROJECTS, {"mission_id": mission, "name": "Beta"})
    root = await post(user_client, DOCS, {"title": "Root", "project_id": alpha["id"]})
    # The child ignores another project: it takes its parent's.
    child = await post(
        user_client, DOCS, {"title": "Child", "parent_id": root["id"], "project_id": beta["id"]}
    )
    leaf = await post(user_client, DOCS, {"title": "Leaf", "parent_id": child["id"]})
    assert child["project_id"] == leaf["project_id"] == alpha["id"]
    loose = await post(user_client, DOCS, {"title": "Loose"})
    assert loose["project_id"] is None

    in_alpha = (await user_client.get(DOCS, params={"project_id": alpha["id"]})).json()
    assert {d["title"] for d in in_alpha} == {"Root", "Child", "Leaf"}
    by_mission = (await user_client.get(DOCS, params={"mission_id": mission})).json()
    assert len(by_mission) == 3
    unfiled = (await user_client.get(DOCS, params={"unfiled": True})).json()
    assert [d["title"] for d in unfiled] == ["Loose"]
    assert (await user_client.get(f"{PROJECTS}/{alpha['id']}")).json()["document_count"] == 3

    # Out of its parent to the top level of Beta: the subtree follows.
    moved = await user_client.post(
        f"{DOCS}/{child['id']}/move", json={"parent_id": None, "project_id": beta["id"]}
    )
    assert (moved.json()["parent_id"], moved.json()["project_id"]) == (None, beta["id"])
    assert (await user_client.get(f"{DOCS}/{leaf['id']}")).json()["project_id"] == beta["id"]
    # Into a page of Alpha: back to Alpha.
    await user_client.post(f"{DOCS}/{child['id']}/move", json={"parent_id": root["id"]})
    assert (await user_client.get(f"{DOCS}/{leaf['id']}")).json()["project_id"] == alpha["id"]
    # At the top level without project_id: the project is kept.
    await user_client.post(f"{DOCS}/{child['id']}/move", json={"parent_id": None})
    assert (await user_client.get(f"{DOCS}/{child['id']}")).json()["project_id"] == alpha["id"]
    # Explicit null unfiles.
    await user_client.post(
        f"{DOCS}/{child['id']}/move", json={"parent_id": None, "project_id": None}
    )
    assert (await user_client.get(f"{DOCS}/{leaf['id']}")).json()["project_id"] is None


async def test_project_deletion_rules(user_client: AsyncClient) -> None:
    """RG-16: a project with documents is archived, not deleted; a mission with projects too."""
    mission = await create_mission(user_client)
    project = await post(user_client, PROJECTS, {"mission_id": mission, "name": "Alpha"})
    document = await post(user_client, DOCS, {"title": "Doc", "project_id": project["id"]})
    refused = await user_client.delete(f"{PROJECTS}/{project['id']}")
    assert (refused.status_code, refused.json()["code"]) == (409, "ENTITY_REFERENCED")
    mission_refused = await user_client.delete(f"/api/v1/missions/{mission}")
    assert mission_refused.json()["code"] == "ENTITY_REFERENCED"
    await user_client.delete(f"{DOCS}/{document['id']}")
    assert (await user_client.delete(f"{PROJECTS}/{project['id']}")).status_code == 204
    assert (await user_client.delete(f"/api/v1/missions/{mission}")).status_code == 204


async def test_project_of_another_user_is_refused(
    user_client: AsyncClient, other_client: AsyncClient
) -> None:
    mission = await create_mission(user_client)
    project = await post(user_client, PROJECTS, {"mission_id": mission, "name": "Alpha"})
    other = await other_client.post(PROJECTS, json={"mission_id": mission, "name": "Mine"})
    assert other.status_code == 404
    doc = await other_client.post(DOCS, json={"title": "Doc", "project_id": project["id"]})
    assert doc.status_code == 404
    listed = (await other_client.get(PROJECTS)).json()
    assert listed["items"] == []
