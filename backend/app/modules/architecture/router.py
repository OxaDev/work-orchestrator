"""Architecture, domain, relation and external link endpoints (P8). Personal data (ADR-0010)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.modules.agenda.models import HalfDay, Task
from app.modules.agenda.schemas import TaskRead
from app.modules.agenda.tasks import TaskService
from app.modules.architecture import mermaid
from app.modules.architecture.graph import VIEW_LIFECYCLES, build_graph
from app.modules.architecture.links import ExternalLinkService
from app.modules.architecture.models import (
    Domain,
    DomainKind,
    Lifecycle,
    LinkedEntity,
    SubjectDomain,
)
from app.modules.architecture.schemas import (
    ArchitectureCreate,
    ArchitectureDetail,
    ArchitectureSummary,
    ArchitectureUpdate,
    Direction,
    DomainCreate,
    DomainDetail,
    DomainSummary,
    DomainTechnologyUpsert,
    DomainUpdate,
    ExportLanguage,
    ExternalLinkCreate,
    ExternalLinkRead,
    ExternalLinkUpdate,
    Graph,
    GraphView,
    LayoutSave,
    MermaidExport,
    MermaidFormat,
    NodePosition,
    RelationCreate,
    RelationRead,
    RelationUpdate,
)
from app.modules.architecture.service import ArchitectureService, DomainService, RelationService
from app.modules.auth.dependencies import CurrentUser, DbSession
from app.shared.ownership import owned
from app.shared.schemas import IncludeArchived, Search
from app.shared.tree import ancestor_ids, descendant_ids

architectures_router = APIRouter(prefix="/architectures", tags=["architectures"])
domains_router = APIRouter(prefix="/domains", tags=["domains"])
relations_router = APIRouter(prefix="/domain-relations", tags=["domains"])
external_links_router = APIRouter(prefix="/external-links", tags=["external-links"])

NO_CONTENT = status.HTTP_204_NO_CONTENT


# --- architectures -------------------------------------------------------------------------


@architectures_router.get("", response_model=list[ArchitectureSummary])
async def list_architectures(
    user: CurrentUser,
    session: DbSession,
    company_id: uuid.UUID | None = None,
    mission_id: uuid.UUID | None = None,
    q: Search = None,
    include_archived: IncludeArchived = False,
) -> list[ArchitectureSummary]:
    service = ArchitectureService(session, user)
    rows = await service.search(
        company_id=company_id, mission_id=mission_id, search=q, include_archived=include_archived
    )
    return await service.summaries(rows)


@architectures_router.post(
    "", response_model=ArchitectureDetail, status_code=status.HTTP_201_CREATED
)
async def create_architecture(
    body: ArchitectureCreate, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    return await service.detail(await service.create(body))


@architectures_router.get("/{architecture_id}", response_model=ArchitectureDetail)
async def read_architecture(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    return await service.detail(await service.get(architecture_id))


@architectures_router.patch("/{architecture_id}", response_model=ArchitectureDetail)
async def update_architecture(
    architecture_id: uuid.UUID, body: ArchitectureUpdate, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    return await service.detail(await service.update(architecture_id, body))


@architectures_router.post("/{architecture_id}/archive", response_model=ArchitectureDetail)
async def archive_architecture(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    return await service.detail(await service.set_archived(architecture_id, True))


@architectures_router.post("/{architecture_id}/restore", response_model=ArchitectureDetail)
async def restore_architecture(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    return await service.detail(await service.set_archived(architecture_id, False))


@architectures_router.delete("/{architecture_id}", status_code=NO_CONTENT)
async def delete_architecture(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    await ArchitectureService(session, user).delete(architecture_id)
    return Response(status_code=NO_CONTENT)


@architectures_router.put(
    "/{architecture_id}/domains/{domain_id}", response_model=ArchitectureDetail
)
async def add_member(
    architecture_id: uuid.UUID, domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    """Adds a domain, and implicitly its sub-domains, to the architecture (ADR-0037)."""
    service = ArchitectureService(session, user)
    await service.add_member(architecture_id, domain_id)
    return await service.detail(await service.get(architecture_id))


@architectures_router.delete(
    "/{architecture_id}/domains/{domain_id}", response_model=ArchitectureDetail
)
async def remove_member(
    architecture_id: uuid.UUID, domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    await service.remove_member(architecture_id, domain_id)
    return await service.detail(await service.get(architecture_id))


@architectures_router.put(
    "/{architecture_id}/missions/{mission_id}", response_model=ArchitectureDetail
)
async def link_mission(
    architecture_id: uuid.UUID, mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    """Links a mission of the same client (Q-H1)."""
    service = ArchitectureService(session, user)
    await service.link_mission(architecture_id, mission_id, True)
    return await service.detail(await service.get(architecture_id))


@architectures_router.delete(
    "/{architecture_id}/missions/{mission_id}", response_model=ArchitectureDetail
)
async def unlink_mission(
    architecture_id: uuid.UUID, mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ArchitectureDetail:
    service = ArchitectureService(session, user)
    await service.link_mission(architecture_id, mission_id, False)
    return await service.detail(await service.get(architecture_id))


@architectures_router.get("/{architecture_id}/graph", response_model=Graph)
async def architecture_graph(
    architecture_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    depth: Annotated[int | None, Query(ge=0, le=50)] = None,
    include_relations: bool = True,
    kinds: Annotated[list[DomainKind] | None, Query()] = None,
    lifecycles: Annotated[list[Lifecycle] | None, Query()] = None,
) -> Graph:
    """Nodes (members and sub-domains) and edges (relations between them), for P9."""
    architecture = await ArchitectureService(session, user).get(architecture_id)
    return await build_graph(
        session,
        architecture,
        depth=depth,
        include_relations=include_relations,
        kinds=kinds,
        lifecycles=lifecycles,
    )


# --- domains -------------------------------------------------------------------------------


@domains_router.get("", response_model=list[DomainSummary])
async def list_domains(
    user: CurrentUser,
    session: DbSession,
    company_id: uuid.UUID | None = None,
    q: Search = None,
    include_archived: IncludeArchived = False,
) -> list[DomainSummary]:
    """Flat list with parent_id links; the client builds the tree (ADR-0022)."""
    rows = await DomainService(session, user).search(
        company_id=company_id, search=q, include_archived=include_archived
    )
    return [DomainSummary.model_validate(row) for row in rows]


@domains_router.post("", response_model=DomainDetail, status_code=status.HTTP_201_CREATED)
async def create_domain(body: DomainCreate, user: CurrentUser, session: DbSession) -> DomainDetail:
    service = DomainService(session, user)
    return await service.detail(await service.create(body))


@domains_router.get("/{domain_id}", response_model=DomainDetail)
async def read_domain(domain_id: uuid.UUID, user: CurrentUser, session: DbSession) -> DomainDetail:
    service = DomainService(session, user)
    return await service.detail(await service.get(domain_id))


@domains_router.patch("/{domain_id}", response_model=DomainDetail)
async def update_domain(
    domain_id: uuid.UUID, body: DomainUpdate, user: CurrentUser, session: DbSession
) -> DomainDetail:
    """Edits a domain; `parent_id` moves it with its subtree (RG-08)."""
    service = DomainService(session, user)
    return await service.detail(await service.update(domain_id, body))


@domains_router.post("/{domain_id}/archive", response_model=DomainDetail)
async def archive_domain(
    domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DomainDetail:
    service = DomainService(session, user)
    return await service.detail(await service.set_archived(domain_id, True))


@domains_router.post("/{domain_id}/restore", response_model=DomainDetail)
async def restore_domain(
    domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DomainDetail:
    service = DomainService(session, user)
    return await service.detail(await service.set_archived(domain_id, False))


@domains_router.delete("/{domain_id}", status_code=NO_CONTENT)
async def delete_domain(domain_id: uuid.UUID, user: CurrentUser, session: DbSession) -> Response:
    await DomainService(session, user).delete(domain_id)
    return Response(status_code=NO_CONTENT)


@domains_router.get("/{domain_id}/ancestors", response_model=list[DomainSummary])
async def domain_ancestors(
    domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[DomainSummary]:
    """From the top-level domain down to the parent."""
    domain = await DomainService(session, user).get(domain_id)
    ids = list(reversed(await ancestor_ids(session, Domain, domain.id)))
    rows = {d.id: d for d in await session.scalars(select(Domain).where(Domain.id.in_(ids)))}
    return [DomainSummary.model_validate(rows[i]) for i in ids]


@domains_router.get("/{domain_id}/descendants", response_model=list[DomainSummary])
async def domain_descendants(
    domain_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[DomainSummary]:
    domain = await DomainService(session, user).get(domain_id)
    ids = await descendant_ids(session, Domain, domain.id)
    rows = await session.scalars(
        select(Domain).where(Domain.id.in_(ids)).order_by(Domain.normalized_name)
    )
    return [DomainSummary.model_validate(row) for row in rows]


@domains_router.put("/{domain_id}/technologies/{technology_id}", response_model=DomainDetail)
async def set_domain_technology(
    domain_id: uuid.UUID,
    technology_id: uuid.UUID,
    body: DomainTechnologyUpsert,
    user: CurrentUser,
    session: DbSession,
) -> DomainDetail:
    service = DomainService(session, user)
    await service.set_technology(domain_id, technology_id, body.version)
    return await service.detail(await service.get(domain_id))


@domains_router.delete("/{domain_id}/technologies/{technology_id}", response_model=DomainDetail)
async def remove_domain_technology(
    domain_id: uuid.UUID, technology_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DomainDetail:
    service = DomainService(session, user)
    await service.remove_technology(domain_id, technology_id)
    return await service.detail(await service.get(domain_id))


@domains_router.put("/{domain_id}/subjects/{subject_id}", response_model=DomainDetail)
async def link_subject(
    domain_id: uuid.UUID, subject_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DomainDetail:
    """Links an agenda subject to the domain (Q-G5)."""
    service = DomainService(session, user)
    await service.link_subject(domain_id, subject_id)
    return await service.detail(await service.get(domain_id))


@domains_router.delete("/{domain_id}/subjects/{subject_id}", response_model=DomainDetail)
async def unlink_subject(
    domain_id: uuid.UUID, subject_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DomainDetail:
    service = DomainService(session, user)
    await service.unlink_subject(domain_id, subject_id)
    return await service.detail(await service.get(domain_id))


@domains_router.get("/{domain_id}/tasks", response_model=list[TaskRead])
async def domain_tasks(
    domain_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TaskRead]:
    """Latest tasks on the subjects linked to the domain."""
    domain = await DomainService(session, user).get(domain_id)
    tasks = TaskService(session, user)
    rows = await session.scalars(
        owned(select(Task), Task, user.id)
        .join(HalfDay, HalfDay.id == Task.half_day_id)
        .join(SubjectDomain, SubjectDomain.subject_id == Task.subject_id)
        .where(SubjectDomain.domain_id == domain.id)
        .order_by(HalfDay.date.desc(), HalfDay.period.desc(), Task.created_at.desc())
        .limit(limit)
    )
    return await tasks.reads(list(rows))


# --- relations -----------------------------------------------------------------------------


@relations_router.post("", response_model=RelationRead, status_code=status.HTTP_201_CREATED)
async def create_relation(
    body: RelationCreate, user: CurrentUser, session: DbSession
) -> RelationRead:
    """RG-09: never from a domain to itself; both ends in the same company."""
    service = RelationService(session, user)
    relation = await service.create(body)
    return (await service.domains.relation_reads([relation]))[0]


@relations_router.patch("/{relation_id}", response_model=RelationRead)
async def update_relation(
    relation_id: uuid.UUID, body: RelationUpdate, user: CurrentUser, session: DbSession
) -> RelationRead:
    service = RelationService(session, user)
    relation = await service.update(relation_id, body)
    return (await service.domains.relation_reads([relation]))[0]


@relations_router.delete("/{relation_id}", status_code=NO_CONTENT)
async def delete_relation(
    relation_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    await RelationService(session, user).delete(relation_id)
    return Response(status_code=NO_CONTENT)


# --- external links ------------------------------------------------------------------------


@external_links_router.get("", response_model=list[ExternalLinkRead])
async def list_external_links(
    user: CurrentUser, session: DbSession, entity_type: LinkedEntity, entity_id: uuid.UUID
) -> list[ExternalLinkRead]:
    rows = await ExternalLinkService(session, user).for_entity(entity_type, entity_id)
    return [ExternalLinkRead.model_validate(row) for row in rows]


@external_links_router.post(
    "", response_model=ExternalLinkRead, status_code=status.HTTP_201_CREATED
)
async def create_external_link(
    body: ExternalLinkCreate, user: CurrentUser, session: DbSession
) -> ExternalLinkRead:
    return ExternalLinkRead.model_validate(await ExternalLinkService(session, user).create(body))


@external_links_router.patch("/{link_id}", response_model=ExternalLinkRead)
async def update_external_link(
    link_id: uuid.UUID, body: ExternalLinkUpdate, user: CurrentUser, session: DbSession
) -> ExternalLinkRead:
    return ExternalLinkRead.model_validate(
        await ExternalLinkService(session, user).update(link_id, body)
    )


@external_links_router.delete("/{link_id}", status_code=NO_CONTENT)
async def delete_external_link(
    link_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    await ExternalLinkService(session, user).delete(link_id)
    return Response(status_code=NO_CONTENT)


# --- Mermaid export and graph layout (P9, ADR-0025, ADR-0038) ------------------------------


@architectures_router.get("/{architecture_id}/mermaid", response_model=MermaidExport)
async def export_mermaid(
    architecture_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    format_: Annotated[MermaidFormat, Query(alias="format")] = MermaidFormat.FLOWCHART,
    direction: Direction = Direction.LR,
    depth: Annotated[int | None, Query(ge=0, le=50)] = None,
    kinds: Annotated[list[DomainKind] | None, Query()] = None,
    view: GraphView = GraphView.CURRENT,
    lang: ExportLanguage = ExportLanguage.FR,
) -> MermaidExport:
    """Mermaid code of the architecture, filtered like the graph view."""
    architecture = await ArchitectureService(session, user).get(architecture_id)
    graph = await build_graph(
        session,
        architecture,
        depth=depth,
        include_relations=format_ == MermaidFormat.FLOWCHART,
        kinds=kinds,
        lifecycles=VIEW_LIFECYCLES[view],
    )
    code = (
        mermaid.flowchart(graph, direction=direction, view=view, lang=lang)
        if format_ == MermaidFormat.FLOWCHART
        else mermaid.mindmap(graph)
    )
    return MermaidExport(format=format_, code=code)


@architectures_router.get("/{architecture_id}/layout", response_model=list[NodePosition])
async def read_layout(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[NodePosition]:
    """Positions moved by hand in the graph view; the others come from the automatic layout."""
    return await ArchitectureService(session, user).layout(architecture_id)


@architectures_router.put("/{architecture_id}/layout", response_model=list[NodePosition])
async def save_layout(
    architecture_id: uuid.UUID, body: LayoutSave, user: CurrentUser, session: DbSession
) -> list[NodePosition]:
    return await ArchitectureService(session, user).save_layout(architecture_id, body.positions)


@architectures_router.delete("/{architecture_id}/layout", status_code=NO_CONTENT)
async def reset_layout(
    architecture_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    await ArchitectureService(session, user).clear_layout(architecture_id)
    return Response(status_code=NO_CONTENT)
