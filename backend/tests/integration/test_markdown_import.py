"""Markdown folder import (P11-6, ADR-0040): titles, folders, wikilinks, images, limits."""

import io
import zipfile
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_subjects import post

URL = "/api/v1/documents/import-markdown"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def uploads(settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "uploads_dir", tmp_path)
    return tmp_path


def vault(files: dict[str, str | bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


async def send(client: AsyncClient, content: bytes, **data: str) -> tuple[int, dict[str, Any]]:
    response = await client.post(
        URL, files={"file": ("vault.zip", content, "application/zip")}, data=data
    )
    return response.status_code, response.json()


async def documents(client: AsyncClient) -> dict[str, dict[str, Any]]:
    listed = (await client.get("/api/v1/documents")).json()
    return {d["title"]: (await client.get(f"/api/v1/documents/{d['id']}")).json() for d in listed}


async def test_obsidian_vault(user_client: AsyncClient) -> None:
    content = vault(
        {
            # A zipped vault folder: its top directory is not a page.
            "Vault/Index.md": "# Accueil\n\nVoir [[Kafka]], [[Projets/Kafka|le flux]] "
            "et [[Kafka#Topics]]. Inconnu : [[Absent]].\n\n```\n[[Kafka]] in code\n```\n",
            "Vault/Projets/Kafka.md": "Schéma ![[schema.png]] et ![alt](../img/flux%20A.png)"
            ' et ![web](https://example.com/x.png) ![faux](faux.png "titre")\n',
            "Vault/img/flux A.png": PNG,
            "Vault/assets/schema.png": PNG,
            "Vault/faux.png": b"not a png",
            "Vault/.obsidian/app.json": "{}",
            "__MACOSX/Vault/._Index.md": "junk",
        }
    )
    status, report = await send(user_client, content)
    assert status == 200, report
    assert (report["documents"], report["folders"]) == (2, 1)
    assert (report["attachments"], report["skipped_files"]) == (2, 1)
    assert report["unresolved_links"] == 1
    assert len(report["root_ids"]) == 2  # "Accueil" and the "Projets" folder page

    docs = await documents(user_client)
    assert set(docs) == {"Accueil", "Projets", "Kafka"}
    kafka, index = docs["Kafka"], docs["Accueil"]
    # Title from the first heading, else the file name; folders become parent pages.
    assert kafka["parent_id"] == docs["Projets"]["id"]
    body = index["content_md"]
    assert f"[[document:{kafka['id']}|Kafka]]" in body
    assert f"[[document:{kafka['id']}|le flux]]" in body
    assert "[[Absent]]" in body
    assert "```\n[[Kafka]] in code\n```" in body  # code is left alone
    # Backlinks follow the rewritten wikilinks.
    backlinks = (
        await user_client.get("/api/v1/backlinks", params={"type": "document", "id": kafka["id"]})
    ).json()
    assert [b["document"]["id"] for b in backlinks] == [index["id"]]

    text = kafka["content_md"]
    assert "![schema.png](attachment:" in text
    assert "![alt](attachment:" in text
    assert "![web](https://example.com/x.png)" in text
    assert '![faux](faux.png "titre")' in text
    attachment_id = text.split("![alt](attachment:")[1].split(")")[0]
    file = await user_client.get(f"/api/v1/attachments/{attachment_id}")
    assert (file.status_code, file.content) == (200, PNG)


async def test_import_under_a_parent_page(user_client: AsyncClient) -> None:
    parent = await post(user_client, "/api/v1/documents", {"title": "Import"})
    # Same name as an existing page: slugs stay unique.
    await post(user_client, "/api/v1/documents", {"title": "Note"})
    status, report = await send(
        user_client, vault({"note.md": "Sans titre"}), parent_id=parent["id"]
    )
    assert status == 200, report
    docs = (await user_client.get("/api/v1/documents")).json()
    imported = next(d for d in docs if d["parent_id"] == parent["id"])
    assert (imported["title"], imported["slug"]) == ("note", "note-2")


@pytest.mark.parametrize(
    ("files", "reason"),
    [
        ({"readme.txt": "no notes"}, "no_notes"),
        ({f"n{i}.md": "x" for i in range(3)}, "too_many_files"),
    ],
)
async def test_invalid_vaults(
    user_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    files: dict[str, str | bytes],
    reason: str,
) -> None:
    monkeypatch.setattr("app.modules.documents.markdown_import.MAX_FILES", 2)
    status, body = await send(user_client, vault(files))
    assert (status, body["code"], body["params"]["reason"]) == (
        400,
        "IMPORT_INVALID_ARCHIVE",
        reason,
    )
    status, body = await send(user_client, b"nope")
    assert (status, body["params"]["reason"]) == (400, "zip")
    assert (await user_client.get("/api/v1/documents")).json() == []


async def test_size_limit_and_isolation(
    user_client: AsyncClient,
    other_client: AsyncClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parent = await post(other_client, "/api/v1/documents", {"title": "À l'autre"})
    status, body = await send(user_client, vault({"a.md": "x"}), parent_id=parent["id"])
    assert status == 404, body
    monkeypatch.setattr(settings, "max_markdown_import_bytes", 10)
    status, body = await send(user_client, vault({"a.md": "x"}))
    assert (status, body["code"]) == (413, "FILE_TOO_LARGE")
