"""Deep and wide domain trees (P8-12, ADR-0022, ADR-0037)."""

import time
import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.architecture.models import (
    Architecture,
    ArchitectureDomain,
    Domain,
    DomainKind,
    DomainRelation,
    RelationType,
)
from app.modules.auth.models import User
from app.shared.ids import uuid7
from tests.integration.test_subjects import post

DEPTH = 12
WIDTH = 480


async def test_deep_and_wide_tree(user_client: AsyncClient, db_session: AsyncSession) -> None:
    owner_id = await db_session.scalar(select(User.id).where(User.email == "user@example.com"))
    assert owner_id is not None
    company = await post(user_client, "/api/v1/companies", {"name": "Big Bank"})
    company_id = uuid.UUID(company["id"])

    def node(name: str, parent: uuid.UUID | None) -> Domain:
        return Domain(
            id=uuid7(),
            owner_id=owner_id,
            company_id=company_id,
            parent_id=parent,
            name=name,
            normalized_name=name.lower(),
            kind=DomainKind.SERVICE,
            description="",
        )

    # A 12-level chain...
    chain: list[Domain] = []
    for level in range(DEPTH):
        chain.append(node(f"level {level}", chain[-1].id if chain else None))
    # ...and 480 leaves spread under the first 4 levels: 492 domains in all.
    leaves = [node(f"leaf {i}", chain[i % 4].id) for i in range(WIDTH)]
    architecture = Architecture(
        id=uuid7(), owner_id=owner_id, company_id=company_id, name="SI", normalized_name="si"
    )
    db_session.add_all([*chain, *leaves, architecture])
    await db_session.flush()
    db_session.add(ArchitectureDomain(architecture_id=architecture.id, domain_id=chain[0].id))
    db_session.add_all(
        DomainRelation(
            owner_id=owner_id,
            source_id=leaves[i].id,
            target_id=leaves[i + 1].id,
            type=RelationType.CALLS,
            description="",
        )
        for i in range(0, WIDTH - 1, 2)
    )
    await db_session.commit()

    started = time.perf_counter()
    graph = (await user_client.get(f"/api/v1/architectures/{architecture.id}/graph")).json()
    elapsed = time.perf_counter() - started
    assert len(graph["nodes"]) == DEPTH + WIDTH
    assert len(graph["edges"]) == WIDTH // 2
    deepest = next(n for n in graph["nodes"] if n["name"] == f"level {DEPTH - 1}")
    assert deepest["depth"] == DEPTH - 1
    assert elapsed < 2.0, f"graph took {elapsed:.2f}s"

    limited = (
        await user_client.get(f"/api/v1/architectures/{architecture.id}/graph", params={"depth": 3})
    ).json()
    assert max(n["depth"] for n in limited["nodes"]) == 3

    ancestors = (await user_client.get(f"/api/v1/domains/{chain[-1].id}/ancestors")).json()
    assert [d["name"] for d in ancestors] == [f"level {i}" for i in range(DEPTH - 1)]
    descendants = (await user_client.get(f"/api/v1/domains/{chain[0].id}/descendants")).json()
    assert len(descendants) == DEPTH - 1 + WIDTH

    # Moving a 9-level subtree with its leaves; a cycle 10 levels deep is still caught.
    moved = await user_client.patch(f"/api/v1/domains/{chain[3].id}", json={"parent_id": None})
    assert moved.status_code == 200
    assert len((await user_client.get(f"/api/v1/domains/{chain[3].id}/descendants")).json()) == (
        DEPTH - 4 + WIDTH // 4
    )
    cycle = await user_client.patch(
        f"/api/v1/domains/{chain[3].id}", json={"parent_id": str(chain[-1].id)}
    )
    assert cycle.json()["code"] == "TREE_CYCLE_DETECTED"
