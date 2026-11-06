"""Year view and mission dashboard on a full year of data (P12-2, ADR-0041).

One year of half-days (730), 1,460 tasks over 40 subjects: every read the year view and the
mission overview make stays fast and issues a bounded number of SQL queries (no N+1).
"""

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import HalfDay, HalfDayKind, Period, Task, TaskKind, TaskStatus
from app.modules.auth.models import User
from app.modules.subjects.models import Subject, SubjectScope
from app.shared.ids import uuid7
from tests.integration.test_subjects import create_mission

YEAR = 2026
MAX_SECONDS = 1.0
# A fixed number of reads per page, whatever the volume: the mission overview, the widest,
# runs 26 distinct aggregates (no query per row).
MAX_QUERIES = 30


@contextmanager
def counting(session: AsyncSession) -> Iterator[list[str]]:
    statements: list[str] = []

    def record(*args: Any) -> None:
        statements.append(str(args[2]))

    engine = session.bind.sync_engine  # type: ignore[union-attr]
    event.listen(engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", record)


async def timed_get(
    client: AsyncClient, session: AsyncSession, url: str, **params: Any
) -> tuple[Any, float, int]:
    with counting(session) as statements:
        started = time.perf_counter()
        response = await client.get(url, params=params)
        elapsed = time.perf_counter() - started
    assert response.status_code == 200, response.text
    return response.json(), elapsed, len(statements)


async def test_a_full_year_reads_fast(user_client: AsyncClient, db_session: AsyncSession) -> None:
    owner_id = await db_session.scalar(select(User.id).where(User.email == "user@example.com"))
    assert owner_id is not None
    mission_id = uuid.UUID(await create_mission(user_client, "Perf"))
    subjects = [
        Subject(
            id=uuid7(),
            owner_id=owner_id,
            scope=SubjectScope.MISSION,
            mission_id=mission_id,
            title=f"Sujet {i}",
            description="",
        )
        for i in range(40)
    ]
    db_session.add_all(subjects)
    day = date(YEAR, 1, 1)
    half_days: list[HalfDay] = []
    while day.year == YEAR:
        for period in Period:
            half_days.append(
                HalfDay(
                    id=uuid7(),
                    owner_id=owner_id,
                    date=day,
                    period=period,
                    kind=HalfDayKind.MISSION,
                    mission_id=mission_id,
                )
            )
        day += timedelta(days=1)
    db_session.add_all(half_days)
    await db_session.flush()
    db_session.add_all(
        Task(
            owner_id=owner_id,
            half_day_id=half_day.id,
            subject_id=subjects[i % len(subjects)].id,
            kind=TaskKind.TASK,
            title=f"Tâche {i}",
            duration_minutes=90,
            status=TaskStatus.DONE,
            description="",
        )
        for i, half_day in enumerate(half_days * 2)
    )
    await db_session.commit()

    year = {"from": f"{YEAR}-01-01", "to": f"{YEAR}-12-31"}
    reads: dict[str, tuple[str, dict[str, Any]]] = {
        "half-days": ("/api/v1/agenda/half-days", year),
        "stats": ("/api/v1/agenda/stats", year),
        "months": ("/api/v1/agenda/months", {"year": YEAR}),
        "tasks": ("/api/v1/agenda/tasks", {"from": f"{YEAR}-03-01", "to": f"{YEAR}-03-31"}),
        "overview": (f"/api/v1/missions/{mission_id}/overview", {}),
        "career": ("/api/v1/career", {}),
    }
    slow = []
    for name, (url, params) in reads.items():
        body, elapsed, queries = await timed_get(user_client, db_session, url, **params)
        if elapsed > MAX_SECONDS or queries > MAX_QUERIES:
            slow.append(f"{name}: {elapsed:.2f}s, {queries} queries")
        if name == "half-days":
            assert len(body) == len(half_days)
    assert slow == []
