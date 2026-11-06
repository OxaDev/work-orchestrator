"""Global search endpoint (P11-2, ADR-0040). Personal types are scoped to the user (ADR-0010)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.modules.auth.dependencies import CurrentUser, DbSession
from app.modules.search.definitions import SearchType
from app.modules.search.service import SearchService

router = APIRouter(tags=["search"])


class SearchResult(BaseModel):
    type: SearchType
    id: uuid.UUID
    title: str
    # Hits are wrapped in U+E000 ... U+E001; the client turns them into highlights.
    snippet: str
    date: date | None
    archived: bool
    rank: float


@router.get("/search", response_model=list[SearchResult])
async def search(
    user: CurrentUser,
    session: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    types: Annotated[list[SearchType] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[SearchResult]:
    """Full text over documents, logs, tasks, subjects, domains, architectures, missions,
    contacts, companies and technologies, best matches first."""
    hits = await SearchService(session, user).search(q, types, limit)
    return [SearchResult(**hit.__dict__) for hit in hits]
