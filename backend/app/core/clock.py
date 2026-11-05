"""Single source of the current time, patchable in tests."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
