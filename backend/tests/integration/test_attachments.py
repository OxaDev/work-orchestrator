"""Uploaded files (P7-5, ADR-0027, ADR-0036): size, types, SVG, headers, access control."""

from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_subjects import post

URL = "/api/v1/attachments"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def uploads(settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "uploads_dir", tmp_path)
    monkeypatch.setattr(settings, "max_upload_bytes", 1024)
    return tmp_path


async def upload(client: AsyncClient, name: str, content: bytes, **data: str) -> tuple[int, dict]:  # type: ignore[type-arg]
    response = await client.post(URL, files={"file": (name, content)}, data=data)
    return response.status_code, response.json()


async def test_upload_download_and_delete(user_client: AsyncClient, uploads: Path) -> None:
    document = await post(user_client, "/api/v1/documents", {"title": "Doc"})
    status, body = await upload(
        user_client, "../../Capture d'écran.PNG", PNG, document_id=document["id"]
    )
    assert status == 201, body
    assert (body["filename"], body["mime_type"], body["size"]) == (
        "Capture d'écran.PNG",
        "image/png",
        len(PNG),
    )
    assert body["document_id"] == document["id"]
    stored = list(uploads.rglob("*"))  # noqa: ASYNC240 - test inspection of a tmp dir
    # Stored under <owner>/<id>, never under its original name.
    assert [p.name for p in stored if p.is_file()] == [body["id"]]

    response = await user_client.get(f"{URL}/{body['id']}")
    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in response.headers["content-security-policy"]
    assert response.headers["content-disposition"].startswith("inline; filename*=UTF-8''Capture")

    status, csv = await upload(user_client, "export.csv", b"a;b\n1;2\n")
    assert status == 201
    csv_response = await user_client.get(f"{URL}/{csv['id']}")
    assert csv_response.headers["content-disposition"].startswith("attachment;")

    assert (await user_client.delete(f"{URL}/{body['id']}")).status_code == 204
    assert (await user_client.get(f"{URL}/{body['id']}")).status_code == 404
    assert not (uploads / stored[0].parent.name / body["id"]).exists()


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("malware.exe", b"MZ" + b"\x00" * 10),
        ("noextension", b"hello"),
        ("fake.png", b"GIF89a" + b"\x00" * 10),  # content does not match the extension
        ("fake.pdf", b"hello"),
        ("binary.txt", b"abc\x00def"),
        ("latin1.csv", "é".encode("latin-1")),
        ("empty.png", b""),
        ("script.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        ("handler.svg", b'<svg onload="alert(1)"/>'),
        ("link.svg", b'<svg><a href="javascript:alert(1)"/></svg>'),
        ("html.svg", b"<svg><foreignObject><body/></foreignObject></svg>"),
        ("notsvg.svg", b"<html></html>"),
    ],
)
async def test_forbidden_types_are_refused(
    user_client: AsyncClient, name: str, content: bytes
) -> None:
    status, body = await upload(user_client, name, content)
    assert status == 415, body
    assert body["code"] == "FILE_TYPE_NOT_ALLOWED"


async def test_accepted_formats(user_client: AsyncClient) -> None:
    for name, content in [
        ("diagram.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>'),
        ("photo.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 8),
        ("anim.gif", b"GIF89a" + b"\x00" * 8),
        ("img.webp", b"RIFF\x00\x00\x00\x00WEBPVP8 "),
        ("spec.pdf", b"%PDF-1.7\n"),
        ("plan.docx", b"PK\x03\x04" + b"\x00" * 8),
        ("old.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 8),
        ("notes.md", "# Titre\nnoté".encode()),
    ]:
        status, body = await upload(user_client, name, content)
        assert status == 201, (name, body)


async def test_size_limit(user_client: AsyncClient) -> None:
    status, body = await upload(user_client, "big.txt", b"a" * 1025)
    assert status == 413
    assert body == {
        "code": "FILE_TOO_LARGE",
        "detail": "FILE_TOO_LARGE",
        "params": {"maxBytes": 1024},
    }
    status, _ = await upload(user_client, "fits.txt", b"a" * 1024)
    assert status == 201


async def test_files_are_private(user_client: AsyncClient, other_client: AsyncClient) -> None:
    """ADR-0027: a second user gets 404 on someone else's file and cannot attach to their doc."""
    status, body = await upload(user_client, "secret.png", PNG)
    assert status == 201
    assert (await other_client.get(f"{URL}/{body['id']}")).status_code == 404
    assert (await other_client.delete(f"{URL}/{body['id']}")).status_code == 404
    document = await post(user_client, "/api/v1/documents", {"title": "Doc"})
    status, _ = await upload(other_client, "x.png", PNG, document_id=document["id"])
    assert status == 404
