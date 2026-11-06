"""Archive export and import (P11-4, P11-5, ADR-0040)."""

from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.modules.archive.service import ArchiveService, chunks
from app.modules.auth.dependencies import AppSettings, CurrentUser, DbSession
from app.modules.documents.files import content_disposition

router = APIRouter(tags=["archive"])


class ImportReportRead(BaseModel):
    tables: dict[str, int]
    # Shared rows already present under another id, linked to the existing ones.
    matched: int
    attachments: int
    missing_files: int


@router.get(
    "/export",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/zip": {}}}},
)
async def export_archive(
    user: CurrentUser, session: DbSession, settings: AppSettings
) -> StreamingResponse:
    """Everything the user owns, the shared referentials and the files, as one zip."""
    file, filename = await ArchiveService(session, user, settings).export()
    return StreamingResponse(
        chunks(file),
        media_type="application/zip",
        headers={"Content-Disposition": content_disposition(filename, family_inline=False)},
    )


@router.post("/import", response_model=ImportReportRead)
async def import_archive(
    user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
    file: Annotated[UploadFile, File()],
) -> ImportReportRead:
    """Restores an export into an account holding no personal data (zip up to 200 MB)."""
    report = await ArchiveService(session, user, settings).import_archive(file)
    return ImportReportRead(**report.__dict__)
