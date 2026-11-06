"""Task / half-day compatibility matrix (ADR-0020, RG-03, RG-04, RG-05).

The single source of the rule: services call `check`, the UI reads `MATRIX` through
`GET /agenda/compatibility` and never duplicates it.
"""

import uuid

from fastapi import status

from app.core.errors import AppError, ErrorCode
from app.modules.agenda.models import HalfDayKind
from app.modules.subjects.models import SubjectScope

# Subject scopes accepted by each half-day kind. MISSION also requires the same mission (RG-04).
MATRIX: dict[HalfDayKind, frozenset[SubjectScope]] = {
    HalfDayKind.MISSION: frozenset({SubjectScope.MISSION}),
    HalfDayKind.INTERCONTRACT: frozenset(
        {SubjectScope.INTERCONTRACT, SubjectScope.TRAINING, SubjectScope.PERSONAL}
    ),
    HalfDayKind.TRAINING: frozenset({SubjectScope.TRAINING}),
    # RG-05: absences hold no task.
    HalfDayKind.LEAVE: frozenset(),
    HalfDayKind.PUBLIC_HOLIDAY: frozenset(),
    HalfDayKind.SICK_LEAVE: frozenset(),
    HalfDayKind.OFF: frozenset(),
}

# Half-day kind an empty slot receives when a task of this scope is placed on it (ADR-0034).
NATURAL_KIND: dict[SubjectScope, HalfDayKind | None] = {
    SubjectScope.MISSION: HalfDayKind.MISSION,
    SubjectScope.INTERCONTRACT: HalfDayKind.INTERCONTRACT,
    SubjectScope.TRAINING: HalfDayKind.TRAINING,
    SubjectScope.PERSONAL: None,
}


def is_compatible(
    kind: HalfDayKind,
    half_day_mission_id: uuid.UUID | None,
    scope: SubjectScope,
    subject_mission_id: uuid.UUID | None,
) -> bool:
    if scope not in MATRIX[kind]:
        return False
    return kind != HalfDayKind.MISSION or half_day_mission_id == subject_mission_id


def incompatible(kind: HalfDayKind, scope: SubjectScope) -> AppError:
    return AppError(
        ErrorCode.TASK_INCOMPATIBLE_HALF_DAY,
        status_code=status.HTTP_409_CONFLICT,
        params={"halfDayKind": kind.value, "subjectScope": scope.value},
    )


def check(
    kind: HalfDayKind,
    half_day_mission_id: uuid.UUID | None,
    scope: SubjectScope,
    subject_mission_id: uuid.UUID | None,
) -> None:
    if not is_compatible(kind, half_day_mission_id, scope, subject_mission_id):
        raise incompatible(kind, scope)
