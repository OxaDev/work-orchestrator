"""Archive export and import (P11-4, P11-5, ADR-0040).

An archive is a zip: `manifest.json`, `data/<table>.json`, `documents/<slug>.md` (readable copy)
and `attachments/<id>`. Ids are kept: an archive goes into an account holding no personal data.
Shared referentials already present under another id (seeded per instance) are matched by their
natural key, and every reference to them, Markdown included, is rewritten.
"""

import asyncio
import hashlib
import json
import re
import tempfile
import uuid
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

from fastapi import UploadFile, status
from sqlalchemy import Table, and_, delete, func, insert, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.modules.agenda.models import HalfDay, HalfDayKind, HolidayGeneration
from app.modules.archive.tables import (
    POLYMORPHIC,
    TableKind,
    archive_tables,
    dump,
    load_row,
    natural_key,
    owned_foreign_keys,
    self_reference,
)
from app.modules.auth.models import User
from app.shared.zips import CHUNK, SPOOL, invalid, open_zip, spool

FORMAT = 1
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

Rows = list[dict[str, Any]]


@dataclass
class ImportReport:
    tables: dict[str, int] = field(default_factory=dict)
    matched: int = 0
    attachments: int = 0
    missing_files: int = 0


def read_json(archive: zipfile.ZipFile, name: str) -> Any:
    try:
        return json.loads(archive.read(name))
    except KeyError:
        return None
    except (ValueError, zipfile.BadZipFile) as error:
        raise invalid(name) from error


def parents_first(rows: Rows, column: str | None) -> Rows:
    """Orders a tree so that each row comes after its parent."""
    if column is None:
        return rows
    ids = {row["id"] for row in rows}
    placed: set[uuid.UUID] = set()
    ordered: Rows = []
    pending = rows
    while pending:
        ready = [r for r in pending if r.get(column) not in ids or r[column] in placed]
        if not ready:  # a cycle: let the database refuse it
            return ordered + pending
        ordered.extend(ready)
        placed.update(row["id"] for row in ready)
        pending = [row for row in pending if row["id"] not in placed]
    return ordered


class ArchiveService:
    def __init__(self, session: AsyncSession, user: User, settings: Settings) -> None:
        self.session = session
        self.user = user
        self.settings = settings

    def file_path(self, owner_id: uuid.UUID, attachment_id: uuid.UUID) -> Path:
        return self.settings.uploads_dir / str(owner_id) / str(attachment_id)

    # ---- Export ---------------------------------------------------------------------------

    async def _rows(self, table: Table, kind: TableKind) -> Rows:
        query = select(table)
        if kind == TableKind.OWNED:
            query = query.where(table.c.owner_id == self.user.id)
        elif kind == TableKind.CHILD:
            query = query.where(
                or_(
                    *(
                        column.in_(select(parent.c.id).where(parent.c.owner_id == self.user.id))
                        for column, parent in owned_foreign_keys(table)
                    )
                )
            )
        result = await self.session.execute(query.order_by(*table.primary_key.columns))
        return [{str(key): row._mapping[key] for key in row._mapping} for row in result]

    async def collect(self) -> dict[str, Rows]:
        data: dict[str, Rows] = {}
        exported: set[uuid.UUID] = set()
        later: list[Table] = []
        for table, kind in archive_tables():
            if table.name in POLYMORPHIC:
                later.append(table)
                continue
            data[table.name] = await self._rows(table, kind)
            if "id" in table.c:
                exported.update(row["id"] for row in data[table.name])
        for table in later:
            rows = await self._rows(table, TableKind.SHARED)
            data[table.name] = [row for row in rows if row[POLYMORPHIC[table.name]] in exported]
        return data

    def manifest(self, data: dict[str, Rows]) -> dict[str, Any]:
        return {
            "format": FORMAT,
            "app_version": __version__,
            "exported_at": utcnow().isoformat(),
            "profile": {
                "employer_company_id": dump(self.user.employer_company_id),
                "holiday_subdivision": self.user.holiday_subdivision,
            },
            "tables": {name: len(rows) for name, rows in data.items()},
        }

    async def export(self) -> tuple[IO[bytes], str]:
        """Builds the archive in a temporary file; returns it rewound, with its file name."""
        data = await self.collect()
        manifest = self.manifest(data)
        files = {
            row["id"]: self.file_path(row["owner_id"], row["id"])
            for row in data.get("attachments", [])
        }
        target = await asyncio.to_thread(self._write_zip, data, manifest, files)
        return target, f"work-orchestrator-{utcnow().date().isoformat()}.zip"

    @staticmethod
    def _write_zip(
        data: dict[str, Rows], manifest: dict[str, Any], files: dict[uuid.UUID, Path]
    ) -> IO[bytes]:
        target = tempfile.SpooledTemporaryFile(max_size=SPOOL)  # noqa: SIM115 - returned open
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, indent=2))
            for name, rows in data.items():
                content = [{key: dump(value) for key, value in row.items()} for row in rows]
                archive.writestr(f"data/{name}.json", json.dumps(content, ensure_ascii=False))
            for document in data.get("documents", []):
                archive.writestr(f"documents/{document['slug']}.md", document["content_md"])
            for attachment_id, path in files.items():
                if path.is_file():
                    archive.write(path, f"attachments/{attachment_id}")
        target.seek(0)
        return target

    # ---- Import ---------------------------------------------------------------------------

    async def _ensure_empty(self) -> None:
        """Refuses an account with personal data. Public holidays are generated at the first
        agenda visit, so a fresh account holds some: they are replaced by the archive's."""
        for table, kind in archive_tables():
            if kind != TableKind.OWNED or table.name == HolidayGeneration.__tablename__:
                continue
            query = select(func.count()).select_from(table).where(table.c.owner_id == self.user.id)
            if table.name == HalfDay.__tablename__:
                query = query.where(table.c.kind != HalfDayKind.PUBLIC_HOLIDAY)
            if await self.session.scalar(query):
                raise AppError(
                    ErrorCode.IMPORT_ACCOUNT_NOT_EMPTY,
                    status_code=status.HTTP_409_CONFLICT,
                    params={"table": table.name},
                )
        for model in (HalfDay, HolidayGeneration):
            await self.session.execute(delete(model).where(model.owner_id == self.user.id))

    @staticmethod
    def _remap(row: dict[str, Any], ids: dict[uuid.UUID, uuid.UUID]) -> None:
        if not ids:
            return
        text = {str(old): str(new) for old, new in ids.items()}
        for name, value in row.items():
            if isinstance(value, uuid.UUID) and value in ids and name != "id":
                row[name] = ids[value]
            elif isinstance(value, str) and _UUID.search(value):
                row[name] = _UUID.sub(lambda match: text.get(match[0], match[0]), value)

    async def _insert_shared(
        self, table: Table, rows: Rows, ids: dict[uuid.UUID, uuid.UUID]
    ) -> int:
        if "id" not in table.c:
            for row in rows:
                self._remap(row, ids)
            if rows:
                await self.session.execute(pg_insert(table).on_conflict_do_nothing(), rows)
            return len(rows)
        present = set(
            await self.session.scalars(
                select(table.c.id).where(table.c.id.in_([row["id"] for row in rows]))
            )
        )
        key = natural_key(table)
        inserted = 0
        for row in rows:
            self._remap(row, ids)
            if row["id"] in present:
                continue
            if key and all(column in row for column in key):
                match = await self.session.scalar(
                    select(table.c.id).where(
                        and_(*(table.c[column].is_not_distinct_from(row[column]) for column in key))
                    )
                )
                if match is not None:
                    ids[row["id"]] = match
                    continue
            await self.session.execute(insert(table), [row])
            inserted += 1
        return inserted

    def _load(self, archive: zipfile.ZipFile) -> tuple[dict[str, Any], dict[str, Rows]]:
        manifest = read_json(archive, "manifest.json")
        if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
            raise invalid("manifest")
        data: dict[str, Rows] = {}
        for table, _kind in archive_tables():
            raw = read_json(archive, f"data/{table.name}.json") or []
            if not isinstance(raw, list) or not all(isinstance(item, dict) for item in raw):
                raise invalid(table.name)
            try:
                data[table.name] = [load_row(table, item) for item in raw]
            except (ValueError, TypeError) as error:
                raise invalid(table.name) from error
        return manifest, data

    async def _apply_profile(self, profile: Any, ids: dict[uuid.UUID, uuid.UUID]) -> None:
        if not isinstance(profile, dict):
            return
        values: dict[str, Any] = {}
        employer = profile.get("employer_company_id")
        if employer and self.user.employer_company_id is None:
            try:
                company = uuid.UUID(employer)
            except ValueError as error:
                raise invalid("profile") from error
            values["employer_company_id"] = ids.get(company, company)
        subdivision = profile.get("holiday_subdivision")
        if isinstance(subdivision, str) and self.user.holiday_subdivision is None:
            values["holiday_subdivision"] = subdivision[:8]
        if values:
            await self.session.execute(update(User).where(User.id == self.user.id).values(values))

    def _write_files(
        self, archive: zipfile.ZipFile, attachments: Rows, report: ImportReport
    ) -> list[Path]:
        written: list[Path] = []
        names = set(archive.namelist())
        for row in attachments:
            member = f"attachments/{row['id']}"
            if member not in names:
                report.missing_files += 1
                continue
            content = archive.read(member)
            if hashlib.sha256(content).hexdigest() != row.get("sha256"):
                raise invalid(member)
            target = self.file_path(self.user.id, row["id"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            written.append(target)
            report.attachments += 1
        return written

    async def import_archive(self, upload: UploadFile) -> ImportReport:
        file = await spool(upload, self.settings.max_import_bytes)
        written: list[Path] = []
        try:
            archive = await asyncio.to_thread(open_zip, file)
            manifest, data = await asyncio.to_thread(self._load, archive)
            await self._ensure_empty()
            report = ImportReport()
            ids: dict[uuid.UUID, uuid.UUID] = {}
            for table, kind in archive_tables():
                rows = parents_first(data[table.name], self_reference(table))
                if kind == TableKind.SHARED:
                    report.tables[table.name] = await self._insert_shared(table, rows, ids)
                    continue
                for row in rows:
                    if kind == TableKind.OWNED:
                        row["owner_id"] = self.user.id
                    self._remap(row, ids)
                if rows:
                    await self.session.execute(insert(table), rows)
                report.tables[table.name] = len(rows)
            report.matched = len(ids)
            await self._apply_profile(manifest.get("profile"), ids)
            await self.session.flush()
            written = await asyncio.to_thread(
                self._write_files, archive, data.get("attachments", []), report
            )
            await self.session.commit()
        except IntegrityError as error:
            await self._undo(written)
            raise AppError(ErrorCode.IMPORT_CONFLICT, status_code=status.HTTP_409_CONFLICT) from (
                error
            )
        except DBAPIError as error:
            await self._undo(written)
            raise invalid("data") from error
        except BaseException:
            await self._undo(written)
            raise
        finally:
            file.close()
        return report

    async def _undo(self, written: list[Path]) -> None:
        await self.session.rollback()
        for path in written:
            path.unlink(missing_ok=True)


def chunks(file: IO[bytes]) -> Iterator[bytes]:
    try:
        while chunk := file.read(CHUNK):
            yield chunk
    finally:
        file.close()
