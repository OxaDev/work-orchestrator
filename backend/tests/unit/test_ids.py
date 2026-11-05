import time
import uuid

import pytest

from app.shared import ids
from app.shared.ids import uuid7


def test_uuid7_has_version_7_and_rfc_variant() -> None:
    value = uuid7()
    assert value.version == 7
    assert value.variant == uuid.RFC_4122


def test_uuid7_embeds_current_timestamp() -> None:
    before = time.time_ns() // 1_000_000
    value = uuid7()
    after = time.time_ns() // 1_000_000
    timestamp_ms = value.int >> 80
    assert before <= timestamp_ms <= after + 1


def test_uuid7_is_monotonic_within_same_millisecond() -> None:
    values = [uuid7() for _ in range(5000)]
    assert values == sorted(values)
    assert len(set(values)) == len(values)


def test_uuid7_counter_overflow_borrows_next_millisecond(monkeypatch: pytest.MonkeyPatch) -> None:
    frozen_ns = time.time_ns()
    monkeypatch.setattr(time, "time_ns", lambda: frozen_ns)
    values = [uuid7() for _ in range(ids._COUNTER_MAX + 10)]
    assert values == sorted(values)
    assert (values[-1].int >> 80) > (frozen_ns // 1_000_000)
