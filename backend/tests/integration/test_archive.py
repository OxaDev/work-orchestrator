"""Archive export and import (P11-4, P11-5, ADR-0040): round trip, scope, conflicts, files."""

import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.modules.archive.tables import TableKind, archive_tables, owned_foreign_keys
from app.modules.auth.models import User
from tests.integration.test_subjects import create_mission, post

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def uploads(settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "uploads_dir", tmp_path)
    return tmp_path


@pytest.fixture
async def source(user_client: AsyncClient) -> dict[str, Any]:
    """A small but connected account: mission, subject, task, linked documents, a file."""
    mission = await create_mission(user_client, "Banque Horizon")
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
            "duration_minutes": 30,
        },
    )
    parent = await post(user_client, "/api/v1/documents", {"title": "Architecture"})
    response = await user_client.post(
        "/api/v1/attachments",
        files={"file": ("schema.png", PNG)},
        data={"document_id": parent["id"]},
    )
    assert response.status_code == 201, response.text
    attachment = response.json()
    child = await post(
        user_client,
        "/api/v1/documents",
        {
            "title": "Flux",
            "parent_id": parent["id"],
            "content_md": f"Voir [[document:{parent['id']}|Architecture]] "
            f"![schéma](attachment:{attachment['id']}) et [[mission:{mission}|la mission]]",
        },
    )
    return {"mission": mission, "parent": parent, "child": child, "attachment": attachment}


async def export(client: AsyncClient) -> bytes:
    response = await client.get("/api/v1/export")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "work-orchestrator-" in response.headers["content-disposition"]
    return response.content


async def import_(client: AsyncClient, content: bytes) -> tuple[int, dict[str, Any]]:
    response = await client.post(
        "/api/v1/import", files={"file": ("archive.zip", content, "application/zip")}
    )
    return response.status_code, response.json()


def read(content: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def table(content: bytes, name: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = json.loads(read(content)[f"data/{name}.json"])
    return rows


def rewrite(content: bytes, edit: Any) -> bytes:
    """Applies `edit(name, bytes) -> bytes` to every member of an archive."""
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w") as archive:
        for name, data in read(content).items():
            archive.writestr(name, edit(name, data))
    return target.getvalue()


async def wipe(session: AsyncSession, email: str) -> None:
    """Deletes everything a user owns, as if the archive came from another instance."""
    owner = await session.scalar(select(User.id).where(User.email == email))
    tables = archive_tables()
    for tbl, kind in reversed(tables):
        if kind == TableKind.CHILD:
            for column, parent in owned_foreign_keys(tbl):
                ids = select(parent.c.id).where(parent.c.owner_id == owner)
                await session.execute(delete(tbl).where(column.in_(ids)))
    for tbl, kind in reversed(tables):
        if kind == TableKind.OWNED:
            for fk in tbl.foreign_keys:
                if fk.column.table is tbl:
                    await session.execute(
                        update(tbl).where(tbl.c.owner_id == owner).values({fk.parent.name: None})
                    )
            await session.execute(delete(tbl).where(tbl.c.owner_id == owner))
    await session.flush()


async def test_export_holds_own_data_shared_referentials_and_files(
    user_client: AsyncClient, other_client: AsyncClient, source: dict[str, Any]
) -> None:
    await post(other_client, "/api/v1/documents", {"title": "Secret de l'autre"})
    content = await export(user_client)
    members = read(content)
    manifest = json.loads(members["manifest.json"])
    assert manifest["format"] == 1
    assert manifest["tables"]["documents"] == 2
    assert {d["title"] for d in table(content, "documents")} == {"Architecture", "Flux"}
    # Children follow their owner; shared referentials travel whole; accounts never.
    assert len(table(content, "document_versions")) >= 2
    assert {c["name"] for c in table(content, "companies")} >= {
        "Client Banque Horizon",
        "ESN Banque Horizon",
    }
    assert "data/half_day_subtypes.json" in members
    assert "data/users.json" not in members
    assert "data/refresh_tokens.json" not in members
    assert members[f"attachments/{source['attachment']['id']}"] == PNG
    assert members["documents/flux.md"].decode().startswith("Voir [[document:")


async def test_round_trip_into_an_empty_account(
    user_client: AsyncClient,
    other_client: AsyncClient,
    db_session: AsyncSession,
    source: dict[str, Any],
) -> None:
    content = await export(user_client)
    await wipe(db_session, "user@example.com")
    # A fresh account already holds generated public holidays: they are replaced.
    generated = await other_client.post("/api/v1/agenda/public-holidays/generate?year=2026")
    assert generated.status_code == 200, generated.text

    status, report = await import_(other_client, content)
    assert status == 200, report
    assert report["tables"]["documents"] == 2
    assert report["attachments"] == 1
    assert report["missing_files"] == 0

    child = (await other_client.get(f"/api/v1/documents/{source['child']['id']}")).json()
    assert child["content_md"] == source["child"]["content_md"]
    assert child["parent_id"] == source["parent"]["id"]
    file = await other_client.get(f"/api/v1/attachments/{source['attachment']['id']}")
    assert (file.status_code, file.content) == (200, PNG)
    mission = await other_client.get(f"/api/v1/missions/{source['mission']}")
    assert mission.status_code == 200
    tasks = await other_client.get(
        "/api/v1/agenda/tasks", params={"from": "2026-03-02", "to": "2026-03-02"}
    )
    assert [t["title"] for t in tasks.json()] == ["Revue Keycloak"]


async def test_import_refuses_an_account_with_data(
    user_client: AsyncClient, source: dict[str, Any]
) -> None:
    content = await export(user_client)
    status, body = await import_(user_client, content)
    assert status == 409
    assert body["code"] == "IMPORT_ACCOUNT_NOT_EMPTY"


async def test_import_conflicts_when_ids_exist(
    user_client: AsyncClient, other_client: AsyncClient, source: dict[str, Any]
) -> None:
    """Ids are kept, so the same archive cannot be imported twice into one instance."""
    content = await export(user_client)
    status, body = await import_(other_client, content)
    assert (status, body["code"]) == (409, "IMPORT_CONFLICT")
    # Nothing was written: the other account is still empty.
    assert (await other_client.get("/api/v1/documents")).json() == []


async def test_shared_rows_are_matched_by_natural_key(
    user_client: AsyncClient,
    other_client: AsyncClient,
    db_session: AsyncSession,
    source: dict[str, Any],
) -> None:
    """Seeded referentials have other ids on another instance: references are rewritten."""
    content = await export(user_client)
    await wipe(db_session, "user@example.com")
    company = next(c for c in table(content, "companies") if c["name"] == "Client Banque Horizon")
    foreign = str(uuid.uuid4())

    def elsewhere(name: str, data: bytes) -> bytes:
        if name.startswith("attachments/"):
            return data
        return data.replace(company["id"].encode(), foreign.encode())

    moved = rewrite(content, elsewhere)
    status, report = await import_(other_client, moved)
    assert status == 200, report
    assert report["matched"] >= 1
    mission = (await other_client.get(f"/api/v1/missions/{source['mission']}")).json()
    assert mission["client"]["id"] == company["id"]


@pytest.mark.parametrize(
    ("content", "reason"),
    [
        (b"not a zip", "zip"),
        (None, "manifest"),
    ],
)
async def test_invalid_archives(
    other_client: AsyncClient, content: bytes | None, reason: str
) -> None:
    if content is None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("manifest.json", json.dumps({"format": 99}))
        content = buffer.getvalue()
    status, body = await import_(other_client, content)
    assert (status, body["code"], body["params"]["reason"]) == (
        400,
        "IMPORT_INVALID_ARCHIVE",
        reason,
    )


async def test_tampered_file_is_refused(
    user_client: AsyncClient,
    other_client: AsyncClient,
    db_session: AsyncSession,
    source: dict[str, Any],
    uploads: Path,
) -> None:
    content = await export(user_client)
    await wipe(db_session, "user@example.com")
    tampered = rewrite(
        content, lambda name, data: b"evil" if name.startswith("attachments/") else data
    )
    status, body = await import_(other_client, tampered)
    assert (status, body["code"]) == (400, "IMPORT_INVALID_ARCHIVE")
    other = await db_session.scalar(select(User.id).where(User.email == "other@example.com"))
    assert not (uploads / str(other)).exists()


async def test_import_size_limit(
    other_client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "max_import_bytes", 10)
    status, body = await import_(other_client, b"x" * 11)
    assert (status, body["code"]) == (413, "FILE_TOO_LARGE")
