"""Global search (P11-1, P11-2, ADR-0026, ADR-0040).

Each word of the query is a prefix (`word:*`); all words are required, in French or English,
accents ignored; names also match by trigram similarity. Snippets mark hits with U+E000 /
U+E001, never with HTML.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.search.definitions import SEARCHABLES, Searchable, SearchType

HIT_START = ""
HIT_END = ""
HEADLINE_OPTIONS = (
    f"StartSel={HIT_START}, StopSel={HIT_END}, MaxWords=24, MinWords=8, "
    'MaxFragments=2, FragmentDelimiter=" … "'
)
_WORD = re.compile(r"\w+", re.UNICODE)
MAX_WORDS = 8


@dataclass(frozen=True)
class Hit:
    type: SearchType
    id: uuid.UUID
    title: str
    snippet: str
    date: date | None
    archived: bool
    rank: float


def prefix_query(raw: str) -> str | None:
    """'Migrations Kafka' -> 'migrations:* & kafka:*': words only, so no tsquery injection."""
    words = _WORD.findall(raw.lower())[:MAX_WORDS]
    return " & ".join(f"{word}:*" for word in words) or None


def statement(kind: SearchType, searchable: Searchable) -> str:
    """One query per type. Expressions come from `definitions.py`, never from the user."""
    is_task = kind == SearchType.TASK
    is_log = kind == SearchType.DAILY_LOG
    title = "t.date::text" if is_log else searchable.title
    day = "h.date" if is_task else ("t.date" if is_log else "NULL::date")
    join = "JOIN half_days h ON h.id = t.half_day_id" if is_task else ""
    body = "concat_ws(' … ', " + ", ".join(searchable.body) + ")"
    archived = "t.archived_at IS NOT NULL" if searchable.archivable else "false"
    name = f"f_unaccent(lower({searchable.name}))" if searchable.name else None
    similarity = f"similarity({name}, f_unaccent(lower(:raw)))" if name else "0"
    match = (
        f"(t.search_vector @@ q.query OR {name} % f_unaccent(lower(:raw)))"
        if name
        else "t.search_vector @@ q.query"
    )
    owner = "AND t.owner_id = :owner" if searchable.owned else ""
    return f"""
        SELECT t.id, btrim({title}) AS title, {day} AS day, {archived} AS archived,
               greatest(ts_rank_cd(t.search_vector, q.query), {similarity}) AS rank,
               ts_headline('french', {body}, q.query, :options) AS snippet
        FROM {searchable.table} t {join},
             (SELECT to_tsquery('french', f_unaccent(:tsq))
                     || to_tsquery('english', f_unaccent(:tsq)) AS query) q
        WHERE {match} {owner}
        ORDER BY rank DESC
        LIMIT :limit
    """  # noqa: S608 - only constant fragments are interpolated; values are bound


class SearchService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def search(self, raw: str, types: list[SearchType] | None, limit: int) -> list[Hit]:
        tsq = prefix_query(raw)
        if tsq is None:
            return []
        params = {
            "tsq": tsq,
            "raw": raw.strip(),
            "owner": self.user.id,
            "options": HEADLINE_OPTIONS,
            "limit": limit,
        }
        hits: list[Hit] = []
        for kind in types or list(SEARCHABLES):
            rows = await self.session.execute(text(statement(kind, SEARCHABLES[kind])), params)
            hits.extend(
                Hit(
                    type=kind,
                    id=row.id,
                    title=row.title,
                    snippet=row.snippet or "",
                    date=row.day,
                    archived=row.archived,
                    rank=float(row.rank),
                )
                for row in rows
            )
        hits.sort(key=lambda hit: (-hit.rank, hit.title.casefold()))
        return hits[:limit]
