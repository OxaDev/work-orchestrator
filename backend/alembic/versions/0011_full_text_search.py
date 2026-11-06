"""Full-text search: unaccent, pg_trgm, generated search vectors and indexes (P11-1, ADR-0040).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-06 12:00:00
"""

from collections.abc import Sequence

from alembic import op
from app.modules.search.definitions import (
    SEARCHABLES,
    search_index,
    trigram_index,
    vector_expression,
)

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # unaccent() is only STABLE; generated columns need an IMMUTABLE function.
    op.execute(
        "CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text "
        "LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT "
        "AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$"
    )
    for searchable in SEARCHABLES.values():
        table = searchable.table
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN search_vector tsvector "
            f"GENERATED ALWAYS AS ({vector_expression(searchable)}) STORED"
        )
        op.execute(f"CREATE INDEX {search_index(table)} ON {table} USING gin (search_vector)")
        if searchable.name:
            op.execute(
                f"CREATE INDEX {trigram_index(table)} ON {table} "
                f"USING gin (f_unaccent(lower({searchable.name})) gin_trgm_ops)"
            )


def downgrade() -> None:
    for searchable in SEARCHABLES.values():
        table = searchable.table
        if searchable.name:
            op.execute(f"DROP INDEX IF EXISTS {trigram_index(table)}")
        op.execute(f"DROP INDEX IF EXISTS {search_index(table)}")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS search_vector")
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
