"""Task / half-day compatibility matrix (ADR-0020): RG-03, RG-04, RG-05."""

import uuid

import pytest

from app.core.errors import AppError, ErrorCode
from app.modules.agenda import compatibility
from app.modules.agenda.models import HalfDayKind as K
from app.modules.subjects.models import SubjectScope as S

MISSION_A = uuid.uuid4()
MISSION_B = uuid.uuid4()

ALLOWED = {
    (K.MISSION, S.MISSION),
    (K.INTERCONTRACT, S.INTERCONTRACT),
    (K.INTERCONTRACT, S.TRAINING),
    (K.INTERCONTRACT, S.PERSONAL),
    (K.TRAINING, S.TRAINING),
}


@pytest.mark.parametrize("kind", list(K))
@pytest.mark.parametrize("scope", list(S))
def test_rg03_rg04_rg05_matrix(kind: K, scope: S) -> None:
    """All 28 cells: 7 half-day kinds x 4 subject scopes."""
    half_day_mission = MISSION_A if kind == K.MISSION else None
    subject_mission = MISSION_A if scope == S.MISSION else None
    expected = (kind, scope) in ALLOWED
    assert compatibility.is_compatible(kind, half_day_mission, scope, subject_mission) is expected
    if expected:
        compatibility.check(kind, half_day_mission, scope, subject_mission)
    else:
        with pytest.raises(AppError) as error:
            compatibility.check(kind, half_day_mission, scope, subject_mission)
        assert error.value.code == ErrorCode.TASK_INCOMPATIBLE_HALF_DAY
        assert error.value.status_code == 409
        assert error.value.params == {"halfDayKind": kind.value, "subjectScope": scope.value}


def test_rg04_mission_half_day_accepts_only_its_own_mission() -> None:
    assert compatibility.is_compatible(K.MISSION, MISSION_A, S.MISSION, MISSION_A)
    assert not compatibility.is_compatible(K.MISSION, MISSION_A, S.MISSION, MISSION_B)


def test_rg03_intercontract_never_in_a_mission_half_day() -> None:
    assert not compatibility.is_compatible(K.MISSION, MISSION_A, S.INTERCONTRACT, None)


def test_rg05_absences_hold_no_task() -> None:
    for kind in (K.LEAVE, K.PUBLIC_HOLIDAY, K.SICK_LEAVE, K.OFF):
        assert compatibility.MATRIX[kind] == frozenset()


def test_natural_kind_is_always_compatible() -> None:
    """An empty slot filled for a subject (ADR-0034) must accept that subject."""
    for scope, kind in compatibility.NATURAL_KIND.items():
        if kind is not None:
            mission = MISSION_A if scope == S.MISSION else None
            assert compatibility.is_compatible(kind, mission, scope, mission)
