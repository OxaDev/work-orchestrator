"""Contacts as CSV (P11-7, ADR-0040): export, import, dry run, duplicates, errors."""

from typing import Any

from httpx import AsyncClient

from tests.integration.test_subjects import post

URL = "/api/v1/contacts"


async def send(
    client: AsyncClient, content: str | bytes, dry_run: bool = False
) -> tuple[int, dict[str, Any]]:
    data = content.encode() if isinstance(content, str) else content
    response = await client.post(
        f"{URL}/import",
        params={"dry_run": str(dry_run).lower()},
        files={"file": ("contacts.csv", data, "text/csv")},
    )
    return response.status_code, response.json()


async def names(client: AsyncClient) -> set[str]:
    page = (await client.get(URL, params={"limit": 200})).json()
    return {f"{c['first_name']} {c['last_name']}" for c in page["items"]}


async def test_export_is_excel_friendly_and_safe(user_client: AsyncClient) -> None:
    company = await post(user_client, "/api/v1/companies", {"name": "Acme"})
    await post(
        user_client,
        URL,
        {
            "first_name": "Ada",
            "last_name": "Lovelace",
            "email_work": "ada@acme.com",
            "phone_mobile": "+33 6 12 34 56 78",
            "company_id": company["id"],
            "notes": '=HYPERLINK("http://evil")',
        },
    )
    response = await user_client.get(f"{URL}/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content.startswith("﻿".encode())
    lines = response.content.decode("utf-8-sig").splitlines()
    assert lines[0].split(";")[:2] == ["first_name", "last_name"]
    ada = next(line for line in lines if line.startswith("Ada;"))
    assert ";Acme;" in ada
    assert "+33 6 12 34 56 78" in ada  # phone numbers are not mistaken for formulas
    assert "'=HYPERLINK" in ada  # CSV injection neutralised


async def test_import_round_trip_and_duplicates(user_client: AsyncClient) -> None:
    await post(user_client, "/api/v1/companies", {"name": "Société Générale"})
    await post(
        user_client,
        URL,
        {"first_name": "Grace", "last_name": "Hopper", "email_work": "grace@navy.mil"},
    )
    csv = (
        "First name,Last name,email_work,company,notes,unknown\r\n"
        "Grace,Hopper,GRACE@navy.mil,,,x\r\n"  # same name and e-mail: skipped
        "Grace,Hopper,other@navy.mil,,,x\r\n"  # namesake with another e-mail: created
        'Alan,Turing,,societe generale,"Line one\nline two",x\r\n'
        "Alan,Turing,,,,x\r\n"  # duplicate inside the file (no e-mail on either side)
        "Linus,Torvalds,,Linux Foundation,'=1+1,x\r\n"
        ",,,,,\r\n"
    )
    status, report = await send(user_client, csv, dry_run=True)
    assert status == 200, report
    assert (report["created"], report["skipped"], report["companies_created"]) == (3, 2, 1)
    assert await names(user_client) == {"Grace Hopper"}  # dry run writes nothing

    status, report = await send(user_client, csv)
    assert (report["created"], report["skipped"], report["errors"]) == (3, 2, [])
    page = (await user_client.get(URL, params={"q": "turing"})).json()
    alan = page["items"][0]
    assert alan["company"]["name"] == "Société Générale"
    detail = (await user_client.get(f"{URL}/{alan['id']}")).json()
    assert detail["notes"] == "Line one\nline two"
    linus = (await user_client.get(URL, params={"q": "torvalds"})).json()["items"][0]
    assert linus["company"]["name"] == "Linux Foundation"
    assert (await user_client.get(f"{URL}/{linus['id']}")).json()["notes"] == "=1+1"

    # Importing the same file again creates nothing.
    status, report = await send(user_client, csv)
    assert (report["created"], report["skipped"]) == (0, 5)


async def test_import_reports_errors_by_line(user_client: AsyncClient) -> None:
    csv = (
        "first_name;last_name;email_work;linkedin_url\n"
        "Ada;;;\n"
        "Bob;Martin;not-an-email;\n"
        "Kent;Beck;;notaurl\n"
        "Ward;Cunningham;ward@c2.com;https://linkedin.com/in/ward\n"
    )
    status, report = await send(user_client, csv)
    assert status == 200, report
    assert report["created"] == 1
    assert report["errors"] == [
        {"line": 2, "code": "REQUIRED", "field": "last_name"},
        {"line": 3, "code": "INVALID_EMAIL", "field": "email_work"},
        {"line": 4, "code": "INVALID_URL", "field": "linkedin_url"},
    ]


async def test_cp1252_and_header_errors(user_client: AsyncClient) -> None:
    status, report = await send(
        user_client, "first_name;last_name\nJérôme;Dupré\n".encode("cp1252")
    )
    assert (status, report["created"]) == (200, 1)
    assert "Jérôme Dupré" in await names(user_client)
    status, body = await send(user_client, "name;email\nx;y\n")
    assert (status, body["code"]) == (400, "CSV_INVALID_HEADER")
