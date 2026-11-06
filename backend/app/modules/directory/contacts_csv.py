"""Contacts as CSV (P11-7, ADR-0040).

Export: `;`-separated, UTF-8 with BOM (Excel opens it as is). Import: `;` or `,` detected from the
header; companies matched by normalised name and created when missing; a row matching an
existing contact (same normalised name, and a shared e-mail or no e-mail on either side) is
skipped. `dry_run` reports without writing. Errors are codes per line, never prose (ADR-0014).
"""

import csv
import io
import re
import uuid
from dataclasses import dataclass, field

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.modules.directory.models import Company, Contact
from app.modules.directory.schemas import ContactCreate
from app.modules.directory.service import ContactService
from app.shared.text import clean, normalize_text

COLUMNS = (
    "first_name",
    "last_name",
    "job_title",
    "email_work",
    "email_personal",
    "phone_work",
    "phone_mobile",
    "linkedin_url",
    "company",
    "notes",
)
REQUIRED = ("first_name", "last_name")
# Cells a spreadsheet would run as a formula (CSV injection); phone numbers are left alone.
_FORMULA = re.compile(r"^[=+\-@\t\r]")
_PHONE = re.compile(r"^\+?[\d\s().-]+$")
_ERROR_CODES = {
    "missing": "REQUIRED",
    "string_too_short": "REQUIRED",
    "string_too_long": "TOO_LONG",
    "value_error": "INVALID_EMAIL",
    "url_parsing": "INVALID_URL",
    "url_scheme": "INVALID_URL",
}


@dataclass
class RowError:
    line: int
    code: str
    field: str | None = None


@dataclass
class CsvImportReport:
    created: int = 0
    skipped: int = 0
    companies_created: int = 0
    errors: list[RowError] = field(default_factory=list)


def safe_cell(value: str | None) -> str:
    if not value:
        return ""
    if _FORMULA.match(value) and not _PHONE.match(value):
        return "'" + value
    return value


def unsafe_cell(value: str) -> str:
    """Reverses `safe_cell`, so an export imports back unchanged."""
    if value.startswith("'") and _FORMULA.match(value[1:]):
        return value[1:]
    return value


def decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1252", errors="replace")


async def export_contacts(session: AsyncSession) -> str:
    companies = {company.id: company.name for company in await session.scalars(select(Company))}
    contacts = await session.scalars(
        select(Contact)
        .where(Contact.archived_at.is_(None))
        .order_by(Contact.last_name, Contact.first_name)
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for contact in contacts:
        company = companies.get(contact.company_id) if contact.company_id else None
        values = {name: getattr(contact, name, None) for name in COLUMNS}
        values["company"] = company
        writer.writerow([safe_cell(values[name]) for name in COLUMNS])
    return "﻿" + buffer.getvalue()


class ContactImporter:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.contacts = ContactService(session)
        self.companies: dict[str, uuid.UUID] = {}
        self.seen: dict[str, list[set[str]]] = {}

    async def _load(self) -> None:
        for company in await self.session.scalars(select(Company)):
            self.companies[company.normalized_name] = company.id
        for contact in await self.session.scalars(select(Contact)):
            self._remember(contact.normalized_name, contact.email_work, contact.email_personal)

    def _remember(self, key: str, *emails: str | None) -> None:
        self.seen.setdefault(key, []).append({e.lower() for e in emails if e})

    def _known(self, key: str, emails: set[str]) -> bool:
        return any(
            (not emails and not known) or bool(emails & known) for known in self.seen.get(key, [])
        )

    async def _company(self, name: str, report: CsvImportReport) -> uuid.UUID:
        key = normalize_text(name)
        if key not in self.companies:
            company = Company(name=name.strip()[:200], normalized_name=key)
            self.session.add(company)
            await self.session.flush()
            self.companies[key] = company.id
            report.companies_created += 1
        return self.companies[key]

    async def run(self, content: bytes, dry_run: bool) -> CsvImportReport:
        text = decode(content)
        header = text.split("\n", 1)[0]
        delimiter = ";" if header.count(";") >= header.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        fields = [normalize_text(name or "").replace(" ", "_") for name in reader.fieldnames or []]
        if not all(column in fields for column in REQUIRED):
            raise AppError(
                ErrorCode.CSV_INVALID_HEADER,
                status_code=status.HTTP_400_BAD_REQUEST,
                params={"required": list(REQUIRED)},
            )
        reader.fieldnames = fields
        await self._load()
        report = CsvImportReport()
        for raw in reader:
            line = reader.line_num
            row = {
                name: unsafe_cell(value.strip())
                for name, value in raw.items()
                if name in COLUMNS and isinstance(value, str)
            }
            if not any(row.values()):
                continue
            try:
                data = ContactCreate(
                    **{
                        # Required names stay "" so they fail as too short, not as a type.
                        name: row.get(name, "") if name in REQUIRED else clean(row.get(name))
                        for name in COLUMNS
                        if name not in ("company", "notes")
                    },
                    notes=row.get("notes", ""),
                )
            except ValidationError as error:
                for issue in error.errors():
                    name = str(issue["loc"][0]) if issue["loc"] else None
                    report.errors.append(
                        RowError(line, _ERROR_CODES.get(issue["type"], "INVALID_VALUE"), name)
                    )
                continue
            key = normalize_text(f"{data.first_name.strip()} {data.last_name.strip()}")
            emails = {str(e).lower() for e in (data.email_work, data.email_personal) if e}
            if self._known(key, emails):
                report.skipped += 1
                continue
            if company := clean(row.get("company")):
                data.company_id = await self._company(company, report)
            await self.contacts.add(data)
            self._remember(key, *emails)
            report.created += 1
        if dry_run:
            await self.session.rollback()
        else:
            await self.session.commit()
        return report
