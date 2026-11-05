"""Generic helpers for single-parent hierarchies stored as adjacency lists (ADR-0022).

Works with any mapped class exposing ``id`` and a self-referencing parent column
(``parent_id`` by default, e.g. ``parent_company_id`` for companies).
"""

import uuid
from typing import Any

from fastapi import status
from sqlalchemy import literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode


async def ancestor_ids(
    session: AsyncSession, model: Any, node_id: uuid.UUID, parent: str = "parent_id"
) -> list[uuid.UUID]:
    """Ancestors of `node_id`, nearest first (parent, grand-parent, ..., root)."""
    parent_col = getattr(model, parent)
    base = select(model.id, parent_col.label("parent"), literal(0).label("depth"))
    cte = base.where(model.id == node_id).cte("ancestors", recursive=True)
    step = select(model.id, parent_col, (cte.c.depth + 1)).join(cte, model.id == cte.c.parent)
    # Cycles cannot exist: every parent change goes through ensure_valid_parent.
    cte = cte.union_all(step)
    rows = await session.execute(select(cte.c.id).where(cte.c.id != node_id).order_by(cte.c.depth))
    return list(rows.scalars())


async def descendant_ids(
    session: AsyncSession, model: Any, node_id: uuid.UUID, parent: str = "parent_id"
) -> set[uuid.UUID]:
    """Every node below `node_id` (excluded), at any depth."""
    parent_col = getattr(model, parent)
    cte = select(model.id).where(parent_col == node_id).cte("descendants", recursive=True)
    cte = cte.union_all(select(model.id).join(cte, parent_col == cte.c.id))
    return set((await session.execute(select(cte.c.id))).scalars())


async def ensure_valid_parent(
    session: AsyncSession,
    model: Any,
    node_id: uuid.UUID,
    new_parent_id: uuid.UUID | None,
    parent: str = "parent_id",
) -> None:
    """Refuses a parent that would create a cycle: itself or one of its descendants (RG-08)."""
    if new_parent_id is None:
        return
    if new_parent_id == node_id or new_parent_id in await descendant_ids(
        session, model, node_id, parent
    ):
        raise AppError(ErrorCode.TREE_CYCLE_DETECTED, status_code=status.HTTP_409_CONFLICT)
