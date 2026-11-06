"""Every route on personal data answers 404 to another user (P12-1, ADR-0010).

The routes come from the OpenAPI schema: a new route taking a personal id is covered without
editing this file. User A owns one entity of each kind; user B calls every route with A's ids
and must get 404 (not 403: the entity's existence is not disclosed); A's data stays intact.
"""

import re
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.integration.test_subjects import create_mission, post

# Path parameters naming personal data. `template_id` is personal under week-templates only.
PERSONAL = {
    "architecture_id",
    "attachment_id",
    "document_id",
    "domain_id",
    "link_id",
    "mission_id",
    "relation_id",
    "subject_id",
    "task_id",
    "template_id",
}
SHARED_PREFIXES = ("/api/v1/document-templates/",)
APPLY = {"start": "2026-03-02", "end": "2026-03-06"}
# Valid bodies, so that only the ownership check can refuse (not request validation).
BODIES: dict[tuple[str, str], Any] = {
    ("POST", "/api/v1/agenda/week-templates/{template_id}/apply"): APPLY,
    ("POST", "/api/v1/agenda/week-templates/{template_id}/preview"): APPLY,
    ("POST", "/api/v1/agenda/week-templates/{template_id}/duplicate"): {"name": "Copie"},
    ("POST", "/api/v1/documents/{document_id}/move"): {"parent_id": None},
    ("PUT", "/api/v1/architectures/{architecture_id}/layout"): {"positions": []},
    ("PUT", "/api/v1/documents/{document_id}"): {"title": "Volé", "content_md": ""},
    ("PUT", "/api/v1/missions/{mission_id}/technologies/{technology_id}"): {"weight": 3},
}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def personal_routes() -> list[tuple[str, str]]:
    paths = create_app(Settings(base_path="")).openapi()["paths"]
    return sorted(
        (method.upper(), path)
        for path, operations in paths.items()
        if set(re.findall(r"\{([^}]+)\}", path)) & PERSONAL and not path.startswith(SHARED_PREFIXES)
        for method in operations
    )


@pytest.fixture
async def owned(
    user_client: AsyncClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> dict[str, str]:
    """One entity of each personal kind, owned by user A, plus the shared ids routes need."""
    monkeypatch.setattr(settings, "uploads_dir", tmp_path)
    mission = await create_mission(user_client, "Isolation")
    company = (await user_client.get(f"/api/v1/missions/{mission}")).json()["client"]["id"]
    subject = await post(
        user_client,
        "/api/v1/subjects",
        {"title": "Sujet A", "scope": "MISSION", "mission_id": mission},
    )
    task = await post(
        user_client,
        "/api/v1/agenda/tasks",
        {
            "date": "2026-03-02",
            "period": "AM",
            "subject_id": subject["id"],
            "title": "Tâche A",
            "duration_minutes": 30,
        },
    )
    document = await post(user_client, "/api/v1/documents", {"title": "Doc A"})
    upload = await user_client.post(
        "/api/v1/attachments",
        files={"file": ("a.png", PNG)},
        data={"document_id": document["id"]},
    )
    assert upload.status_code == 201, upload.text
    architecture = await post(
        user_client, "/api/v1/architectures", {"company_id": company, "name": "SI A"}
    )
    domain = await post(
        user_client,
        "/api/v1/domains",
        {"name": "API A", "company_id": company, "kind": "APPLICATION"},
    )
    target = await post(
        user_client,
        "/api/v1/domains",
        {"name": "DB A", "company_id": company, "kind": "APPLICATION"},
    )
    relation = await post(
        user_client,
        "/api/v1/domain-relations",
        {"source_id": domain["id"], "target_id": target["id"], "type": "CALLS"},
    )
    link = await post(
        user_client,
        "/api/v1/external-links",
        {
            "entity_type": "DOMAIN",
            "entity_id": domain["id"],
            "label": "Git",
            "url": "https://git.example.com",
        },
    )
    template = await post(
        user_client, "/api/v1/agenda/week-templates", {"name": "Semaine A", "slots": []}
    )
    technology = await post(
        user_client, "/api/v1/technologies", {"name": "Isolang", "category": "LANGUAGE"}
    )
    contact = await post(user_client, "/api/v1/contacts", {"first_name": "Ada", "last_name": "A"})
    return {
        "mission_id": mission,
        "subject_id": subject["id"],
        "task_id": task["task"]["id"],
        "document_id": document["id"],
        "attachment_id": upload.json()["id"],
        "architecture_id": architecture["id"],
        "domain_id": domain["id"],
        "relation_id": relation["id"],
        "link_id": link["id"],
        "template_id": template["id"],
        # Shared or structural parameters: real values, so only ownership can refuse.
        "technology_id": technology["id"],
        "contact_id": contact["id"],
        "entity_type": "mission",
        "entity_id": mission,
        "number": "1",
    }


def fill(path: str, ids: dict[str, str]) -> str:
    return re.sub(r"\{([^}]+)\}", lambda match: ids[match[1]], path)


async def test_every_personal_route_is_isolated(
    user_client: AsyncClient, other_client: AsyncClient, owned: dict[str, str]
) -> None:
    routes = personal_routes()
    assert len(routes) > 60  # the schema was read, not an empty list
    leaks: list[str] = []
    for method, path in routes:
        body: Any = BODIES.get((method, path), {} if method in ("POST", "PUT", "PATCH") else None)
        response = await other_client.request(method, fill(path, owned), json=body)
        if response.status_code != 404:
            leaks.append(f"{method} {path} -> {response.status_code}")
    assert leaks == [], "\n".join(leaks)

    # Nothing of A's was changed or deleted by B's attempts.
    for method, path in routes:
        if method == "GET":
            response = await user_client.get(fill(path, owned))
            assert response.status_code == 200, f"{path} -> {response.status_code}"
