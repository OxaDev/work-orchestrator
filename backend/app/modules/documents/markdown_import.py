"""Markdown folder import, Obsidian-style vaults included (P11-6, ADR-0040).

One document per `.md` file; folders become parent pages; `[[Note]]`, `[[Note|label]]` and
`[[Note#heading]]` become `[[document:<id>|label]]` when the note is in the archive; embedded
images and files (`![[img.png]]`, `![alt](img.png)`) are stored as attachments (ADR-0027 checks)
and referenced as `attachment:<id>`. Anything unresolved is left as written.
"""

import asyncio
import posixpath
import re
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.documents.files import AttachmentService
from app.modules.documents.models import Document
from app.modules.documents.service import DocumentService
from app.shared.text import normalize_text
from app.shared.zips import MAX_EXPANDED, invalid, open_zip, spool

MAX_FILES = 2000
_HEADING = re.compile(r"^#\s+(.+?)\s*#*\s*$", re.MULTILINE)
_WIKI = re.compile(r"(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]")
_IMAGE = re.compile(r"!\[([^\]\n]*)\]\(<?([^)>\s]+)>?(\s+\"[^\"]*\")?\)")
_FENCE = re.compile(r"^\s*(```|~~~)")
_EXTERNAL = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)


@dataclass
class MarkdownImportReport:
    documents: int = 0
    folders: int = 0
    attachments: int = 0
    unresolved_links: int = 0
    skipped_files: int = 0
    root_ids: list[uuid.UUID] = field(default_factory=list)


def _usable(name: str) -> bool:
    parts = name.split("/")
    return not (
        name.endswith("/")
        or name.startswith("/")
        or any(part in ("", ".", "..") or part.startswith(".") for part in parts)
        or parts[0] == "__MACOSX"
    )


def _strip_root(names: list[str]) -> dict[str, str]:
    """A zipped vault folder has one top directory: it is the vault, not a page."""
    tops = {name.split("/", 1)[0] for name in names}
    if len(tops) == 1 and all("/" in name for name in names):
        return {name.split("/", 1)[1]: name for name in names}
    return {name: name for name in names}


def _key(path: str) -> str:
    return normalize_text(path.removesuffix(".md"))


def title_of(path: str, content: str) -> str:
    heading = _HEADING.search(content)
    title = heading.group(1) if heading else posixpath.basename(path).removesuffix(".md")
    return title.strip()[:200] or "Document"


class Vault:
    """The archive's files by vault path, with Obsidian's name lookups."""

    def __init__(self, files: dict[str, str]) -> None:
        self.files = files  # vault path -> zip member
        self.notes = sorted(path for path in files if path.lower().endswith(".md"))
        self.by_path = {_key(path): path for path in self.notes}
        self.by_name: dict[str, str] = {}
        for path in self.notes:  # shortest path wins, like Obsidian
            self.by_name.setdefault(_key(posixpath.basename(path)), path)
        self.files_by_name: dict[str, str] = {}
        for path in sorted(files, key=len):
            self.files_by_name.setdefault(posixpath.basename(path).lower(), path)

    def note(self, target: str) -> str | None:
        key = _key(target.strip())
        return self.by_path.get(key) or self.by_name.get(_key(posixpath.basename(key)))

    def file(self, target: str, note: str) -> str | None:
        target = unquote(target.strip())
        for candidate in (
            posixpath.normpath(posixpath.join(posixpath.dirname(note), target)),
            posixpath.normpath(target),
        ):
            if candidate in self.files:
                return candidate
        return self.files_by_name.get(posixpath.basename(target).lower())


class MarkdownImporter:
    def __init__(self, session: AsyncSession, user: User, settings: Settings) -> None:
        self.session = session
        self.user = user
        self.settings = settings
        self.documents = DocumentService(session, user)
        self.attachments = AttachmentService(session, user, settings)
        self.written: list[Path] = []

    async def run(self, upload: UploadFile, parent_id: uuid.UUID | None) -> MarkdownImportReport:
        if parent_id is not None:
            await self.documents.get(parent_id)
        file = await spool(upload, self.settings.max_markdown_import_bytes)
        try:
            archive = await asyncio.to_thread(open_zip, file)
            report = await self._import(archive, parent_id)
            await self.session.commit()
        except BaseException:
            await self.session.rollback()
            for path in self.written:
                path.unlink(missing_ok=True)
            raise
        finally:
            file.close()
        return report

    async def _import(
        self, archive: zipfile.ZipFile, parent_id: uuid.UUID | None
    ) -> MarkdownImportReport:
        names = [info.filename for info in archive.infolist() if _usable(info.filename)]
        if len(names) > MAX_FILES:
            raise invalid("too_many_files")
        if sum(archive.getinfo(name).file_size for name in names) > MAX_EXPANDED:
            raise invalid("size")
        vault = Vault(_strip_root(names))
        if not vault.notes:
            raise invalid("no_notes")
        report = MarkdownImportReport()
        contents = {
            path: archive.read(vault.files[path]).decode("utf-8", errors="replace")
            for path in vault.notes
        }

        folders: dict[str, uuid.UUID | None] = {"": parent_id}
        notes: dict[str, Document] = {}
        for path in vault.notes:
            parent = await self._folder(posixpath.dirname(path), folders, report)
            document = await self._create(title_of(path, contents[path]), parent, "")
            notes[path] = document
            report.documents += 1
            if parent == parent_id:
                report.root_ids.append(document.id)

        stored: dict[str, uuid.UUID | None] = {}
        for path, document in notes.items():
            document.content_md = await self._rewrite(
                path, contents[path], vault, notes, archive, stored, report
            )
            await self.session.flush()
            await self.documents._version(document)
            await self.documents._relink(document)
        report.attachments = sum(1 for value in stored.values() if value is not None)
        return report

    async def _create(self, title: str, parent_id: uuid.UUID | None, content: str) -> Document:
        document = Document(
            owner_id=self.user.id,
            parent_id=parent_id,
            title=title,
            slug=await self.documents._slug(title),
            content_md=content,
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def _folder(
        self, folder: str, folders: dict[str, uuid.UUID | None], report: MarkdownImportReport
    ) -> uuid.UUID | None:
        if folder in folders:
            return folders[folder]
        parent = await self._folder(posixpath.dirname(folder), folders, report)
        document = await self._create(posixpath.basename(folder)[:200], parent, "")
        await self.documents._version(document)
        folders[folder] = document.id
        report.folders += 1
        if parent == folders[""]:
            report.root_ids.append(document.id)
        return document.id

    async def _store(
        self,
        path: str,
        archive: zipfile.ZipFile,
        vault: Vault,
        document: Document,
        stored: dict[str, uuid.UUID | None],
        report: MarkdownImportReport,
    ) -> uuid.UUID | None:
        if path not in stored:
            try:
                content = archive.read(vault.files[path])
                attachment = await self.attachments.store(
                    posixpath.basename(path), content, document.id
                )
            except AppError:
                stored[path] = None
                report.skipped_files += 1
            else:
                self.written.append(self.attachments.path(attachment))
                stored[path] = attachment.id
        return stored[path]

    async def _rewrite(
        self,
        path: str,
        content: str,
        vault: Vault,
        notes: dict[str, Document],
        archive: zipfile.ZipFile,
        stored: dict[str, uuid.UUID | None],
        report: MarkdownImportReport,
    ) -> str:
        lines: list[str] = []
        fenced = False
        for line in content.splitlines(keepends=True):
            if _FENCE.match(line):
                fenced = not fenced
            if fenced or _FENCE.match(line):
                lines.append(line)
                continue
            lines.append(await self._line(line, path, vault, notes, archive, stored, report))
        return "".join(lines)

    async def _line(
        self,
        line: str,
        path: str,
        vault: Vault,
        notes: dict[str, Document],
        archive: zipfile.ZipFile,
        stored: dict[str, uuid.UUID | None],
        report: MarkdownImportReport,
    ) -> str:
        document = notes[path]
        parts: list[str] = []
        position = 0
        for match in _WIKI.finditer(line):
            parts.append(line[position : match.start()])
            position = match.end()
            embed, target, _heading, label = match.groups()
            note = vault.note(target)
            if note is not None:
                text = (label or target).strip().replace("]", "")
                parts.append(f"[[document:{notes[note].id}|{text}]]")
                continue
            file = vault.file(target, path) if embed else None
            attachment = (
                await self._store(file, archive, vault, document, stored, report) if file else None
            )
            if attachment is not None:
                alt = (label or posixpath.basename(target)).replace("]", "")
                parts.append(f"![{alt}](attachment:{attachment})")
            else:
                report.unresolved_links += 1
                parts.append(match.group(0))
        parts.append(line[position:])
        line = "".join(parts)

        parts, position = [], 0
        for match in _IMAGE.finditer(line):
            parts.append(line[position : match.start()])
            position = match.end()
            alt, target, title = match.groups()
            file = None if _EXTERNAL.match(target) else vault.file(target, path)
            attachment = (
                await self._store(file, archive, vault, document, stored, report) if file else None
            )
            if attachment is None:
                parts.append(match.group(0))
            else:
                parts.append(f"![{alt}](attachment:{attachment}{title or ''})")
        parts.append(line[position:])
        return "".join(parts)
