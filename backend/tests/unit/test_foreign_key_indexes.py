"""Every foreign key leads an index (P12-2, ADR-0041).

Deleting a referenced row checks (RESTRICT) or updates (CASCADE, SET NULL) the referencing
rows: without an index on the referencing column, PostgreSQL scans the whole table.
"""

from sqlalchemy import PrimaryKeyConstraint, UniqueConstraint

import app.models  # noqa: F401 - registers every model
from app.shared.models import Base


def test_every_foreign_key_column_leads_an_index() -> None:
    missing = []
    for table in Base.metadata.sorted_tables:
        leading = {index.columns[0].name for index in table.indexes if index.columns}
        leading |= {
            constraint.columns[0].name
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint | PrimaryKeyConstraint)
            and constraint.columns
        }
        missing += [
            f"{table.name}.{fk.parent.name}"
            for fk in table.foreign_keys
            if fk.parent.name not in leading
        ]
    assert missing == []
