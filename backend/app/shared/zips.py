"""Uploaded files and zip archives (ADR-0027, ADR-0040): size-capped spooling, bomb guard."""

import tempfile
import zipfile
from typing import IO

from fastapi import UploadFile, status

from app.core.errors import AppError, ErrorCode

CHUNK = 1024 * 1024
SPOOL = 32 * 1024 * 1024
# Guard against zip bombs: what an archive may expand to.
MAX_EXPANDED = 2 * 1024 * 1024 * 1024


def too_large(limit: int) -> AppError:
    return AppError(
        ErrorCode.FILE_TOO_LARGE,
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        params={"maxBytes": limit},
    )


def invalid(reason: str) -> AppError:
    return AppError(ErrorCode.IMPORT_INVALID_ARCHIVE, params={"reason": reason})


async def spool(upload: UploadFile, limit: int) -> IO[bytes]:
    """Copies an upload to a temporary file, refusing it past `limit` bytes."""
    target = tempfile.SpooledTemporaryFile(max_size=SPOOL)  # noqa: SIM115 - returned open
    size = 0
    while chunk := await upload.read(CHUNK):
        size += len(chunk)
        if size > limit:
            target.close()
            raise too_large(limit)
        target.write(chunk)
    target.seek(0)
    return target


def open_zip(file: IO[bytes]) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(file)
    except zipfile.BadZipFile as error:
        raise invalid("zip") from error
    if sum(info.file_size for info in archive.infolist()) > MAX_EXPANDED:
        raise invalid("size")
    return archive
