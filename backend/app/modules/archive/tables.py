"""Which tables an archive holds, read from the model (ADR-0040).

Owned tables carry `owner_id`; child tables have a foreign key to an owned table; every other
table is a shared referential. A new table is classified automatically: only the exceptions
below are written by hand.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum as PyEnum
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    Numeric,
    Table,
    Time,
    UniqueConstraint,
    Uuid,
)

import app.models  # noqa: F401 - registers every model on the metadata
from app.shared.models import Base

# Accounts and authentication never leave the instance.
EXCLUDED = frozenset({"users", "refresh_tokens", "login_throttles"})
# Shared tables pointing at any entity without a foreign key: only rows about exported rows.
POLYMORPHIC = {"taggings": "entity_id"}
# Shared tables with no unique constraint, matched on these columns when the id differs.
NATURAL_KEYS: dict[str, tuple[str, ...]] = {"sectors": ("parent_id", "name_fr")}


class TableKind(StrEnum):
    OWNED = "owned"
    CHILD = "child"
    SHARED = "shared"


def is_owned(table: Table) -> bool:
    return "owner_id" in table.c


def owned_foreign_keys(table: Table) -> list[tuple[Column[Any], Table]]:
    return [
        (fk.parent, fk.column.table)
        for fk in table.foreign_keys
        if is_owned(fk.column.table) and fk.parent.name != "owner_id"
    ]


def classify(table: Table) -> TableKind:
    if is_owned(table):
        return TableKind.OWNED
    if owned_foreign_keys(table):
        return TableKind.CHILD
    return TableKind.SHARED


def archive_tables() -> list[tuple[Table, TableKind]]:
    """Every exported table, parents before children."""
    return [
        (table, classify(table))
        for table in Base.metadata.sorted_tables
        if table.name not in EXCLUDED
    ]


def natural_key(table: Table) -> tuple[str, ...] | None:
    if table.name in NATURAL_KEYS:
        return NATURAL_KEYS[table.name]
    for constraint in sorted(table.constraints, key=lambda c: str(c.name)):
        if isinstance(constraint, UniqueConstraint):
            return tuple(column.name for column in constraint.columns)
    return None


def self_reference(table: Table) -> str | None:
    """The column pointing at the same table (a tree), if any."""
    for fk in table.foreign_keys:
        if fk.column.table is table:
            return fk.parent.name
    return None


def dump(value: Any) -> Any:
    """Python value -> JSON value."""
    if isinstance(value, uuid.UUID | Decimal):
        return str(value)
    if isinstance(value, date | datetime | time):
        return value.isoformat()
    if isinstance(value, PyEnum):
        return value.value
    return value


def loader(column: Column[Any]) -> Any:
    """JSON value -> Python value for this column."""
    kind = column.type
    if isinstance(kind, Uuid):
        return uuid.UUID
    if isinstance(kind, DateTime):
        return datetime.fromisoformat
    if isinstance(kind, Date):
        return date.fromisoformat
    if isinstance(kind, Time):
        return time.fromisoformat
    if isinstance(kind, Float):
        return float
    if isinstance(kind, Numeric):
        return Decimal
    if isinstance(kind, Enum) and kind.enum_class is not None:
        return kind.enum_class
    return None


def load_row(table: Table, raw: dict[str, Any]) -> dict[str, Any]:
    """Keeps the table's columns only; unknown keys from another version are dropped."""
    row: dict[str, Any] = {}
    for column in table.c:
        if column.name not in raw:
            continue
        value = raw[column.name]
        convert = loader(column)
        row[column.name] = convert(value) if value is not None and convert else value
    return row
