"""System endpoints (health check)."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.db import get_session
from app.core.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["ok"]
    version: str


@router.get("/health", response_model=HealthResponse)
async def health(session: Annotated[AsyncSession, Depends(get_session)]) -> HealthResponse:
    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("Health check: database unreachable: %s", exc)
        raise AppError(
            ErrorCode.DATABASE_UNAVAILABLE,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unreachable",
        ) from exc
    return HealthResponse(status="ok", database="ok", version=__version__)
