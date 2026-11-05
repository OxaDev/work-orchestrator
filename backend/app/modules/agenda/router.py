"""Agenda endpoints (P4). Personal data: always scoped to the current user (ADR-0010)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.modules.agenda.models import Period
from app.modules.agenda.schemas import (
    BulkResult,
    HalfDayAssign,
    HalfDayRead,
    HalfDayValues,
    HolidayGenerationResult,
    LockRequest,
    MonthStatus,
    MonthSummary,
    PublicHoliday,
    Slot,
    SlotList,
    Stats,
    SubtypeCreate,
    SubtypeRead,
    SubtypeUpdate,
    SubtypeWithUsage,
    Unfilled,
    UnlockRequest,
)
from app.modules.agenda.service import (
    HalfDayService,
    HolidayService,
    LockService,
    StatsService,
    SubtypeService,
    half_day_reads,
)
from app.modules.auth.dependencies import CurrentUser, DbSession

router = APIRouter(prefix="/agenda", tags=["agenda"])

From = Annotated[date, Query(alias="from")]
To = Annotated[date, Query(alias="to")]
Year = Annotated[int, Path(ge=2000, le=2100)]
Month = Annotated[int, Path(ge=1, le=12)]
YearQuery = Annotated[int, Query(ge=2000, le=2100)]


# --- half-days -----------------------------------------------------------------------------


@router.get("/half-days", response_model=list[HalfDayRead])
async def list_half_days(
    user: CurrentUser, session: DbSession, start: From, end: To
) -> list[HalfDayRead]:
    """Half-days between two dates included (at most 400 days)."""
    return half_day_reads(await HalfDayService(session, user).between(start, end))


@router.post("/half-days/bulk", response_model=BulkResult)
async def assign_half_days(
    body: HalfDayAssign, user: CurrentUser, session: DbSession
) -> BulkResult:
    """Gives the same values to every selected half-day; creates or replaces, all or nothing."""
    rows = await HalfDayService(session, user).assign(body.slots, body)
    return BulkResult(items=half_day_reads(rows), count=len(rows))


@router.post("/half-days/bulk-delete", response_model=BulkResult)
async def clear_half_days(body: SlotList, user: CurrentUser, session: DbSession) -> BulkResult:
    count = await HalfDayService(session, user).clear(body.slots)
    return BulkResult(items=[], count=count)


@router.put("/half-days/{day}/{period}", response_model=HalfDayRead)
async def put_half_day(
    day: date, period: Period, body: HalfDayValues, user: CurrentUser, session: DbSession
) -> HalfDayRead:
    rows = await HalfDayService(session, user).assign([Slot(date=day, period=period)], body)
    return HalfDayRead.model_validate(rows[0])


@router.delete("/half-days/{day}/{period}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_half_day(
    day: date, period: Period, user: CurrentUser, session: DbSession
) -> Response:
    await HalfDayService(session, user).clear([Slot(date=day, period=period)])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/unfilled", response_model=Unfilled)
async def unfilled_half_days(user: CurrentUser, session: DbSession) -> Unfilled:
    """Past weekday half-days left empty (P4-11)."""
    return await HalfDayService(session, user).unfilled()


@router.get("/stats", response_model=Stats)
async def stats(user: CurrentUser, session: DbSession, start: From, end: To) -> Stats:
    return await StatsService(session, user).compute(start, end)


# --- public holidays ------------------------------------------------------------------------


@router.get("/public-holidays", response_model=list[PublicHoliday])
async def public_holidays(
    user: CurrentUser, session: DbSession, year: YearQuery
) -> list[PublicHoliday]:
    return [
        PublicHoliday(date=d, name=name)
        for d, name in sorted(HolidayService(session, user).for_year(year).items())
    ]


@router.post("/public-holidays/generate", response_model=HolidayGenerationResult)
async def generate_public_holidays(
    user: CurrentUser,
    session: DbSession,
    year: YearQuery,
    force: Annotated[bool, Query()] = False,
) -> HolidayGenerationResult:
    """Pre-fills the year's public holidays once (RG-11); empty half-days only."""
    return await HolidayService(session, user).generate(year, force)


# --- monthly locks --------------------------------------------------------------------------


@router.get("/months", response_model=list[MonthSummary])
async def months(user: CurrentUser, session: DbSession, year: YearQuery) -> list[MonthSummary]:
    return await LockService(session, user).year_summary(year)


@router.get("/months/{year}/{month}", response_model=MonthStatus)
async def month_status(
    year: Year, month: Month, user: CurrentUser, session: DbSession
) -> MonthStatus:
    return await LockService(session, user).status(year, month)


@router.post("/months/{year}/{month}/lock", response_model=MonthStatus)
async def lock_month(
    year: Year, month: Month, body: LockRequest, user: CurrentUser, session: DbSession
) -> MonthStatus:
    """Validates the month like a timesheet (ADR-0021): every weekday half-day must be filled."""
    return await LockService(session, user).lock(year, month, body.note)


@router.post("/months/{year}/{month}/unlock", response_model=MonthStatus)
async def unlock_month(
    year: Year, month: Month, body: UnlockRequest, user: CurrentUser, session: DbSession
) -> MonthStatus:
    return await LockService(session, user).unlock(year, month, body.reason)


# --- subtypes (shared referential) ----------------------------------------------------------


@router.get("/subtypes", response_model=list[SubtypeWithUsage])
async def list_subtypes(session: DbSession) -> list[SubtypeWithUsage]:
    return [
        SubtypeWithUsage(id=s.id, kind=s.kind, name_fr=s.name_fr, name_en=s.name_en, usage=usage)
        for s, usage in await SubtypeService(session).all_with_usage()
    ]


@router.post("/subtypes", response_model=SubtypeRead, status_code=status.HTTP_201_CREATED)
async def create_subtype(body: SubtypeCreate, session: DbSession) -> SubtypeRead:
    return SubtypeRead.model_validate(await SubtypeService(session).create(body))


@router.patch("/subtypes/{subtype_id}", response_model=SubtypeRead)
async def update_subtype(
    subtype_id: uuid.UUID, body: SubtypeUpdate, session: DbSession
) -> SubtypeRead:
    return SubtypeRead.model_validate(await SubtypeService(session).update(subtype_id, body))


@router.delete("/subtypes/{subtype_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtype(subtype_id: uuid.UUID, session: DbSession) -> Response:
    await SubtypeService(session).delete(subtype_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
