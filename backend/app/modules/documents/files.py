"""Uploaded files on the uploads volume (ADR-0027, ADR-0036)."""

import asyncio
import hashlib
import re
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.modules.auth.models import User
from app.modules.documents.models import Attachment, Document
from app.shared.ownership import get_owned
from app.shared.zips import too_large

CHUNK = 1024 * 1024

# Extension -> (MIME type, expected signature family).
ALLOWED: dict[str, tuple[str, str]] = {
    "png": ("image/png", "png"),
    "jpg": ("image/jpeg", "jpeg"),
    "jpeg": ("image/jpeg", "jpeg"),
    "gif": ("image/gif", "gif"),
    "webp": ("image/webp", "webp"),
    "svg": ("image/svg+xml", "svg"),
    "pdf": ("application/pdf", "pdf"),
    "txt": ("text/plain; charset=utf-8", "text"),
    "md": ("text/markdown; charset=utf-8", "text"),
    "csv": ("text/csv; charset=utf-8", "text"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "zip"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "zip"),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "zip"),
    "odt": ("application/vnd.oasis.opendocument.text", "zip"),
    "ods": ("application/vnd.oasis.opendocument.spreadsheet", "zip"),
    "odp": ("application/vnd.oasis.opendocument.presentation", "zip"),
    "doc": ("application/msword", "ole"),
    "xls": ("application/vnd.ms-excel", "ole"),
    "ppt": ("application/vnd.ms-powerpoint", "ole"),
}
INLINE = {"png", "jpeg", "gif", "webp", "svg", "pdf"}
_ACTIVE_SVG = re.compile(rb"<script|\bon[a-z]+\s*=|javascript:|<foreignobject", re.IGNORECASE)
# Served files can never run script in the app's origin, whatever they contain.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
}


def _not_allowed(extension: str) -> AppError:
    return AppError(
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        params={"extension": extension},
    )


def matches(family: str, content: bytes) -> bool:
    """Checks the content against the format its extension announces."""
    head = content[:16]
    if family == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if family == "jpeg":
        return head.startswith(b"\xff\xd8\xff")
    if family == "gif":
        return head[:6] in (b"GIF87a", b"GIF89a")
    if family == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if family == "pdf":
        return head.startswith(b"%PDF-")
    if family == "zip":
        return head.startswith(b"PK\x03\x04")
    if family == "ole":
        return head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    if family in ("text", "svg"):
        if b"\x00" in content:
            return False
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            return False
        if family == "svg":
            return b"<svg" in content.lower() and not _ACTIVE_SVG.search(content)
        return True
    return False


def safe_filename(name: str) -> str:
    base = Path(name.replace("\\", "/")).name.strip() or "file"
    return re.sub(r"[\x00-\x1f]", "", base)[:255]


def content_disposition(filename: str, family_inline: bool) -> str:
    kind = "inline" if family_inline else "attachment"
    return f"{kind}; filename*=UTF-8''{quote(filename)}"


def _write(target: Path, content: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


class AttachmentService:
    def __init__(self, session: AsyncSession, user: User, settings: Settings) -> None:
        self.session = session
        self.user = user
        self.settings = settings

    def path(self, attachment: Attachment) -> Path:
        return self.settings.uploads_dir / str(attachment.owner_id) / str(attachment.id)

    async def get(self, attachment_id: uuid.UUID) -> Attachment:
        return await get_owned(self.session, Attachment, attachment_id, self.user.id, "attachment")

    async def upload(self, file: UploadFile, document_id: uuid.UUID | None) -> Attachment:
        if document_id is not None:
            await get_owned(self.session, Document, document_id, self.user.id, "document")
        limit = self.settings.max_upload_bytes
        chunks: list[bytes] = []
        size = 0
        while chunk := await file.read(CHUNK):
            size += len(chunk)
            if size > limit:
                raise too_large(limit)
            chunks.append(chunk)
        attachment = await self.store(file.filename or "", b"".join(chunks), document_id)
        await self.session.commit()
        return attachment

    async def store(self, name: str, content: bytes, document_id: uuid.UUID | None) -> Attachment:
        """Checks and writes one file; the caller commits (and removes the file on failure)."""
        filename = safe_filename(name)
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if extension not in ALLOWED:
            raise _not_allowed(extension)
        if len(content) > self.settings.max_upload_bytes:
            raise too_large(self.settings.max_upload_bytes)
        mime_type, family = ALLOWED[extension]
        if not content or not matches(family, content):
            raise _not_allowed(extension)

        attachment = Attachment(
            owner_id=self.user.id,
            document_id=document_id,
            filename=filename,
            mime_type=mime_type,
            size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            created_at=utcnow(),
        )
        self.session.add(attachment)
        await self.session.flush()
        # Stored under its id, never its original name (ADR-0027). Disk I/O off the event loop.
        await asyncio.to_thread(_write, self.path(attachment), content)
        return attachment

    def headers(self, attachment: Attachment) -> dict[str, str]:
        family = ALLOWED.get(attachment.filename.rsplit(".", 1)[-1].lower(), ("", ""))[1]
        return {
            **SECURITY_HEADERS,
            "Content-Disposition": content_disposition(attachment.filename, family in INLINE),
            "Cache-Control": "private, max-age=86400",
        }

    async def delete(self, attachment_id: uuid.UUID) -> None:
        attachment = await self.get(attachment_id)
        path = self.path(attachment)
        await self.session.delete(attachment)
        await self.session.commit()
        await asyncio.to_thread(path.unlink, missing_ok=True)
