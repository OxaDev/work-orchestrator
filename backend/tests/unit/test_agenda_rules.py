"""Pure agenda rules (ADR-0018, ADR-0019, RG-02)."""

from datetime import date

import pytest

from app.core.errors import AppError, ErrorCode
from app.modules.agenda import rules
from app.modules.agenda.models import HalfDayKind, HalfDaySubtype, Period, WorkLocation
from app.modules.missions.models import Mission

MISSION = Mission(
    start_date=date(2026, 1, 5), planned_end_date=date(2026, 6, 30), actual_end_date=None
)


def test_month_bounds_and_days() -> None:
    assert rules.month_bounds(2028, 2) == (date(2028, 2, 1), date(2028, 2, 29))
    assert len(list(rules.days(date(2026, 1, 1), date(2026, 1, 31)))) == 31


def test_range_checks() -> None:
    rules.check_range(date(2026, 1, 1), date(2026, 12, 31))
    with pytest.raises(AppError) as reversed_range:
        rules.check_range(date(2026, 2, 1), date(2026, 1, 1))
    assert reversed_range.value.code == ErrorCode.INVALID_DATE_RANGE
    with pytest.raises(AppError) as too_large:
        rules.check_range(date(2026, 1, 1), date(2027, 3, 1))
    assert too_large.value.code == ErrorCode.RANGE_TOO_LARGE


def test_public_holidays_by_region() -> None:
    metropolitan = rules.public_holidays(2026, None)
    assert len(metropolitan) == 11
    assert metropolitan[date(2026, 7, 14)] == "Fête nationale"
    alsace = rules.public_holidays(2026, "57")
    assert set(alsace) - set(metropolitan) == {date(2026, 4, 3), date(2026, 12, 26)}


def test_expected_slots_skip_weekends_and_public_holidays() -> None:
    # 2026-05: 21 weekdays, of which 1st, 8th, 14th (Ascension) and 25th (Whit Monday) are holidays.
    slots = rules.expected_slots(date(2026, 5, 1), date(2026, 5, 31), None)
    assert len(slots) == (21 - 4) * 2
    assert (date(2026, 5, 4), Period.AM) in slots
    assert all(d.weekday() < 5 for d, _ in slots)


def test_months_of() -> None:
    assert rules.months_of([date(2026, 1, 31), date(2026, 2, 1), date(2026, 2, 9)]) == {
        (2026, 1),
        (2026, 2),
    }


@pytest.mark.parametrize(
    ("kind", "mission", "subtype_kind", "location", "dates", "code"),
    [
        (HalfDayKind.MISSION, None, None, None, [], ErrorCode.HALF_DAY_MISSION_REQUIRED),
        (HalfDayKind.LEAVE, MISSION, None, None, [], ErrorCode.HALF_DAY_MISSION_NOT_ALLOWED),
        (
            HalfDayKind.LEAVE,
            None,
            HalfDayKind.SICK_LEAVE,
            None,
            [],
            ErrorCode.SUBTYPE_KIND_MISMATCH,
        ),
        (
            HalfDayKind.LEAVE,
            None,
            None,
            WorkLocation.REMOTE_HOME,
            [],
            ErrorCode.LOCATION_NOT_ALLOWED,
        ),
        (
            HalfDayKind.PUBLIC_HOLIDAY,
            None,
            None,
            WorkLocation.CLIENT_ON_SITE,
            [],
            ErrorCode.LOCATION_NOT_ALLOWED,
        ),
        (
            HalfDayKind.MISSION,
            MISSION,
            None,
            None,
            [date(2026, 1, 2)],
            ErrorCode.MISSION_DATE_OUT_OF_RANGE,
        ),
        (
            HalfDayKind.MISSION,
            MISSION,
            None,
            None,
            [date(2026, 7, 1)],
            ErrorCode.MISSION_DATE_OUT_OF_RANGE,
        ),
    ],
)
def test_rg02_and_location_violations(
    kind: HalfDayKind,
    mission: Mission | None,
    subtype_kind: HalfDayKind | None,
    location: WorkLocation | None,
    dates: list[date],
    code: ErrorCode,
) -> None:
    subtype = HalfDaySubtype(kind=subtype_kind) if subtype_kind else None
    with pytest.raises(AppError) as error:
        rules.validate_values(kind, mission, subtype, location, dates)
    assert error.value.code == code


def test_valid_values() -> None:
    rules.validate_values(
        HalfDayKind.MISSION,
        MISSION,
        None,
        WorkLocation.REMOTE_HOME,
        [date(2026, 1, 5), date(2026, 6, 30)],
    )
    rules.validate_values(
        HalfDayKind.LEAVE, None, HalfDaySubtype(kind=HalfDayKind.LEAVE), None, [date(2026, 1, 1)]
    )
    open_ended = Mission(start_date=date(2026, 1, 5), planned_end_date=None, actual_end_date=None)
    rules.validate_values(HalfDayKind.MISSION, open_ended, None, None, [date(2030, 1, 1)])


def test_actual_end_date_wins() -> None:
    ended_early = Mission(
        start_date=date(2026, 1, 5),
        planned_end_date=date(2026, 12, 31),
        actual_end_date=date(2026, 3, 31),
    )
    with pytest.raises(AppError):
        rules.validate_values(HalfDayKind.MISSION, ended_early, None, None, [date(2026, 4, 1)])
