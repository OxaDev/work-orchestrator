"""Mission date rules and status suggestion (P3-4)."""

from datetime import date

import pytest

from app.core.errors import AppError, ErrorCode
from app.modules.missions.models import Mission, MissionStatus
from app.modules.missions.service import check_dates, suggested_status

TODAY = date(2026, 11, 5)


def _mission(
    status: MissionStatus,
    start: date,
    planned: date | None = None,
    actual: date | None = None,
) -> Mission:
    return Mission(
        status=status, start_date=start, planned_end_date=planned, actual_end_date=actual
    )


@pytest.mark.parametrize(
    ("mission", "expected"),
    [
        (_mission(MissionStatus.ACTIVE, date(2026, 1, 1), date(2026, 12, 31)), None),
        (_mission(MissionStatus.PROSPECT, date(2026, 1, 1)), MissionStatus.ACTIVE),
        (_mission(MissionStatus.ACTIVE, date(2025, 1, 1), date(2026, 6, 30)), MissionStatus.ENDED),
        # The actual end date wins over the planned one.
        (
            _mission(MissionStatus.ENDED, date(2025, 1, 1), date(2026, 6, 30), date(2026, 12, 1)),
            MissionStatus.ACTIVE,
        ),
        (_mission(MissionStatus.ENDED, date(2025, 1, 1), None, date(2026, 1, 1)), None),
        # Future missions may be PROSPECT or ACTIVE: no suggestion.
        (_mission(MissionStatus.PROSPECT, date(2027, 1, 1)), None),
        (_mission(MissionStatus.ACTIVE, date(2027, 1, 1)), None),
        # ON_HOLD is deliberate and never second-guessed.
        (_mission(MissionStatus.ON_HOLD, date(2025, 1, 1), date(2025, 6, 1)), None),
        # Ends today: still running.
        (_mission(MissionStatus.ACTIVE, date(2026, 1, 1), TODAY), None),
    ],
)
def test_suggested_status(mission: Mission, expected: MissionStatus | None) -> None:
    assert suggested_status(mission, TODAY) == expected


def test_end_dates_must_not_precede_start() -> None:
    check_dates(TODAY, TODAY, None)
    check_dates(TODAY, None, TODAY)
    for planned, actual in ((date(2026, 11, 4), None), (None, date(2026, 11, 4))):
        with pytest.raises(AppError) as error:
            check_dates(TODAY, planned, actual)
        assert error.value.code == ErrorCode.INVALID_DATE_RANGE
