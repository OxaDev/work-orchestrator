"""Architecture graph (P8-7, ADR-0037): member domains, their subtrees, relations between them."""

import uuid

from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.architecture.models import (
    Architecture,
    ArchitectureDomain,
    Domain,
    DomainKind,
    DomainRelation,
    Lifecycle,
)
from app.modules.architecture.schemas import Graph, GraphEdge, GraphNode, GraphView
from app.modules.directory.models import OrgUnit
from app.modules.directory.schemas import Summary

# Lifecycles shown by each view (ADR-0038): today, tomorrow, or everything.
VIEW_LIFECYCLES: dict[GraphView, list[Lifecycle] | None] = {
    GraphView.CURRENT: [Lifecycle.CURRENT, Lifecycle.DEPRECATED],
    GraphView.TARGET: [Lifecycle.CURRENT, Lifecycle.TARGET],
    GraphView.BOTH: None,
}


async def subtree_depths(
    session: AsyncSession, roots: list[uuid.UUID], max_depth: int | None
) -> dict[uuid.UUID, int]:
    """Non-archived domains under `roots` (included), with their smallest depth below a root."""
    if not roots:
        return {}
    base = select(Domain.id, literal(0).label("depth")).where(
        Domain.id.in_(roots), Domain.archived_at.is_(None)
    )
    cte = base.cte("subtree", recursive=True)
    step = (
        select(Domain.id, (cte.c.depth + 1).label("depth"))
        .join(cte, Domain.parent_id == cte.c.id)
        .where(Domain.archived_at.is_(None))
    )
    if max_depth is not None:
        step = step.where(cte.c.depth < max_depth)
    # The tree is acyclic (RG-08): the recursion always ends.
    cte = cte.union_all(step)
    rows = await session.execute(select(cte.c.id, func.min(cte.c.depth)).group_by(cte.c.id))
    return {node_id: int(depth) for node_id, depth in rows}


async def build_graph(
    session: AsyncSession,
    architecture: Architecture,
    *,
    depth: int | None,
    include_relations: bool,
    kinds: list[DomainKind] | None,
    lifecycles: list[Lifecycle] | None,
) -> Graph:
    members = list(
        await session.scalars(
            select(ArchitectureDomain.domain_id).where(
                ArchitectureDomain.architecture_id == architecture.id
            )
        )
    )
    depths = await subtree_depths(session, members, depth)
    domains = {d.id: d for d in await session.scalars(select(Domain).where(Domain.id.in_(depths)))}
    kept = {
        domain_id
        for domain_id, domain in domains.items()
        if (not kinds or domain.kind in kinds)
        and (not lifecycles or domain.lifecycle in lifecycles)
    }

    def nearest_kept_ancestor(domain: Domain) -> uuid.UUID | None:
        parent = domain.parent_id
        while parent is not None and parent in domains:
            if parent in kept:
                return parent
            parent = domains[parent].parent_id
        return None

    member_set = set(members)
    unit_ids = {d.owner_org_unit_id for d in domains.values() if d.owner_org_unit_id}
    units = {
        unit_id: Summary(id=unit_id, name=name)
        for unit_id, name in await session.execute(
            select(OrgUnit.id, OrgUnit.name).where(OrgUnit.id.in_(unit_ids))
        )
    }
    nodes = [
        GraphNode(
            id=domain.id,
            parent_id=nearest_kept_ancestor(domain),
            name=domain.name,
            kind=domain.kind,
            lifecycle=domain.lifecycle,
            criticality=domain.criticality,
            depth=depths[domain.id],
            member=domain.id in member_set,
            owner=units.get(domain.owner_org_unit_id) if domain.owner_org_unit_id else None,
        )
        for domain in sorted(
            (domains[k] for k in kept), key=lambda d: (depths[d.id], d.normalized_name)
        )
    ]
    edges: list[GraphEdge] = []
    if include_relations and kept:
        relations = await session.scalars(
            select(DomainRelation)
            .where(DomainRelation.source_id.in_(kept), DomainRelation.target_id.in_(kept))
            .where(DomainRelation.lifecycle.in_(lifecycles) if lifecycles else literal(True))
            .order_by(DomainRelation.created_at)
        )
        edges = [
            GraphEdge(
                id=r.id,
                source_id=r.source_id,
                target_id=r.target_id,
                type=r.type,
                label=r.label,
                protocol=r.protocol,
                sync_mode=r.sync_mode,
                lifecycle=r.lifecycle,
            )
            for r in relations
        ]
    return Graph(
        architecture=Summary(id=architecture.id, name=architecture.name), nodes=nodes, edges=edges
    )
