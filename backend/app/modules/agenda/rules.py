"""Pure agenda rules, independent of the database (ADR-0018, ADR-0019)."""

import calendar
from collections.abc import Iterable, Iterator
from datetime import date, timedelta
from functools import lru_cache

import holidays
from fastapi import status

from app.core.errors import AppError, ErrorCode
from app.modules.agenda.models import WORKING_KINDS, HalfDayKind, HalfDaySubtype, Period
from app.modules.missions.models import Mission

MAX_RANGE_DAYS = 400


def unprocessable(code: ErrorCode, **params: object) -> AppError:
    return AppError(code, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, params=params)


def days(start: date, end: date) -> Iterator[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def is_weekday(day: date) -> bool:
    return day.weekday() < 5


def month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def check_range(start: date, end: date) -> None:
    if end < start:
        raise unprocessable(ErrorCode.INVALID_DATE_RANGE)
    if (end - start).days >= MAX_RANGE_DAYS:
        raise unprocessable(ErrorCode.RANGE_TOO_LARGE, maxDays=MAX_RANGE_DAYS)


@lru_cache(maxsize=64)
def public_holidays(year: int, subdivision: str | None) -> dict[date, str]:
    """French public holidays for a year and region (ADR-0018), with their French names."""
    calendar_ = holidays.country_holidays("FR", subdiv=subdivision, years=year, language="fr")
    return dict(calendar_)


def holidays_between(start: date, end: date, subdivision: str | None) -> dict[date, str]:
    result: dict[date, str] = {}
    for year in range(start.year, end.year + 1):
        result |= {d: n for d, n in public_holidays(year, subdivision).items() if start <= d <= end}
    return result


def expected_slots(start: date, end: date, subdivision: str | None) -> list[tuple[date, Period]]:
    """Half-days that should be filled: weekdays that are not public holidays."""
    off = holidays_between(start, end, subdivision)
    return [
        (day, period)
        for day in days(start, end)
        if is_weekday(day) and day not in off
        for period in Period
    ]


def months_of(dates: Iterable[date]) -> set[tuple[int, int]]:
    return {(d.year, d.month) for d in dates}


def mission_end(mission: Mission) -> date | None:
    return mission.actual_end_date or mission.planned_end_date


def validate_values(
    kind: HalfDayKind,
    mission: Mission | None,
    subtype: HalfDaySubtype | None,
    location: object | None,
    dates: Iterable[date],
) -> None:
    """RG-02 and ADR-0019 for a set of half-days receiving the same values."""
    if kind == HalfDayKind.MISSION and mission is None:
        raise unprocessable(ErrorCode.HALF_DAY_MISSION_REQUIRED)
    if kind != HalfDayKind.MISSION and mission is not None:
        raise unprocessable(ErrorCode.HALF_DAY_MISSION_NOT_ALLOWED)
    if subtype is not None and subtype.kind != kind:
        raise unprocessable(ErrorCode.SUBTYPE_KIND_MISMATCH)
    if location is not None and kind not in WORKING_KINDS:
        raise unprocessable(ErrorCode.LOCATION_NOT_ALLOWED)
    if mission is not None:
        end = mission_end(mission)
        outside = sorted(d for d in dates if d < mission.start_date or (end and d > end))
        if outside:
            raise unprocessable(
                ErrorCode.MISSION_DATE_OUT_OF_RANGE,
                date=outside[0].isoformat(),
                start=mission.start_date.isoformat(),
                end=end.isoformat() if end else None,
            )
