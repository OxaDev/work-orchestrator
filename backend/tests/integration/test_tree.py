"""Generic tree helpers (ADR-0022, RG-08), exercised on sectors."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.modules.directory.models import Sector
from app.shared.tree import ancestor_ids, descendant_ids, ensure_valid_parent


async def _chain(session: AsyncSession, depth: int) -> list[Sector]:
    nodes: list[Sector] = []
    for level in range(depth):
        node = Sector(
            name_fr=f"n{level}", name_en=f"n{level}", parent_id=nodes[-1].id if nodes else None
        )
        session.add(node)
        await session.flush()
        nodes.append(node)
    return nodes


async def test_ancestors_are_ordered_nearest_first_on_a_deep_tree(db_session: AsyncSession) -> None:
    nodes = await _chain(db_session, 12)
    assert await ancestor_ids(db_session, Sector, nodes[-1].id) == [
        n.id for n in reversed(nodes[:-1])
    ]
    assert await ancestor_ids(db_session, Sector, nodes[0].id) == []


async def test_descendants_cover_every_level(db_session: AsyncSession) -> None:
    nodes = await _chain(db_session, 5)
    sibling = Sector(name_fr="s", name_en="s", parent_id=nodes[1].id)
    db_session.add(sibling)
    await db_session.flush()
    assert await descendant_ids(db_session, Sector, nodes[1].id) == {
        *(n.id for n in nodes[2:]),
        sibling.id,
    }
    assert await descendant_ids(db_session, Sector, nodes[-1].id) == set()


@pytest.mark.parametrize("target", [0, 3])
async def test_rg08_parent_cannot_be_self_or_descendant(
    db_session: AsyncSession, target: int
) -> None:
    nodes = await _chain(db_session, 4)
    with pytest.raises(AppError) as error:
        await ensure_valid_parent(db_session, Sector, nodes[0].id, nodes[target].id)
    assert error.value.code == ErrorCode.TREE_CYCLE_DETECTED


async def test_valid_parents_are_accepted(db_session: AsyncSession) -> None:
    nodes = await _chain(db_session, 3)
    await ensure_valid_parent(db_session, Sector, nodes[2].id, nodes[0].id)
    await ensure_valid_parent(db_session, Sector, nodes[2].id, None)
