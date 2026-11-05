"""Mission endpoints (P3). Personal data: always scoped to the current user (ADR-0010)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.modules.auth.dependencies import CurrentUser, DbSession
from app.modules.missions.models import MissionStatus
from app.modules.missions.schemas import (
    MissionContactUpsert,
    MissionCreate,
    MissionDetail,
    MissionSummary,
    MissionTechnologyUpsert,
    MissionUpdate,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    RoleWithUsage,
)
from app.modules.missions.service import MissionService, RoleService
from app.shared.schemas import IncludeArchived, Limit, Offset, Page, Search

router = APIRouter(prefix="/missions", tags=["missions"])
roles_router = APIRouter(prefix="/contact-roles", tags=["contact-roles"])

NO_CONTENT = status.HTTP_204_NO_CONTENT


@router.get("", response_model=Page[MissionSummary])
async def list_missions(
    user: CurrentUser,
    session: DbSession,
    q: Search = None,
    status_: Annotated[MissionStatus | None, Query(alias="status")] = None,
    client_id: uuid.UUID | None = None,
    active_on: Annotated[date | None, Query(description="Missions running on this day")] = None,
    period_start: Annotated[date | None, Query(alias="from")] = None,
    period_end: Annotated[date | None, Query(alias="to")] = None,
    include_archived: IncludeArchived = False,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[MissionSummary]:
    service = MissionService(session, user)
    items, total = await service.search(
        search=q,
        mission_status=status_,
        client_id=client_id,
        active_on=active_on,
        period_start=period_start,
        period_end=period_end,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return Page(items=await service.summaries(items), total=total)


@router.post("", response_model=MissionDetail, status_code=status.HTTP_201_CREATED)
async def create_mission(
    body: MissionCreate, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    return await service.detail(await service.create(body))


@router.get("/{mission_id}", response_model=MissionDetail)
async def read_mission(
    mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    return await service.detail(await service.get(mission_id))


@router.patch("/{mission_id}", response_model=MissionDetail)
async def update_mission(
    mission_id: uuid.UUID, body: MissionUpdate, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    return await service.detail(await service.update(mission_id, body))


@router.post("/{mission_id}/archive", response_model=MissionDetail)
async def archive_mission(
    mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    return await service.detail(await service.set_archived(mission_id, True))


@router.post("/{mission_id}/restore", response_model=MissionDetail)
async def restore_mission(
    mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    return await service.detail(await service.set_archived(mission_id, False))


@router.delete("/{mission_id}", status_code=NO_CONTENT)
async def delete_mission(mission_id: uuid.UUID, user: CurrentUser, session: DbSession) -> Response:
    await MissionService(session, user).delete(mission_id)
    return Response(status_code=NO_CONTENT)


@router.put("/{mission_id}/contacts/{contact_id}", response_model=MissionDetail)
async def put_mission_contact(
    mission_id: uuid.UUID,
    contact_id: uuid.UUID,
    body: MissionContactUpsert,
    user: CurrentUser,
    session: DbSession,
) -> MissionDetail:
    """Adds the contact to the mission, or updates its role and note."""
    service = MissionService(session, user)
    await service.upsert_contact(mission_id, contact_id, body)
    return await service.detail(await service.get(mission_id))


@router.delete("/{mission_id}/contacts/{contact_id}", response_model=MissionDetail)
async def delete_mission_contact(
    mission_id: uuid.UUID, contact_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    await service.remove_contact(mission_id, contact_id)
    return await service.detail(await service.get(mission_id))


@router.put("/{mission_id}/technologies/{technology_id}", response_model=MissionDetail)
async def put_mission_technology(
    mission_id: uuid.UUID,
    technology_id: uuid.UUID,
    body: MissionTechnologyUpsert,
    user: CurrentUser,
    session: DbSession,
) -> MissionDetail:
    """Adds the technology with its weight (1-5), or updates weight, version and note."""
    service = MissionService(session, user)
    await service.upsert_technology(mission_id, technology_id, body)
    return await service.detail(await service.get(mission_id))


@router.delete("/{mission_id}/technologies/{technology_id}", response_model=MissionDetail)
async def delete_mission_technology(
    mission_id: uuid.UUID, technology_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionDetail:
    service = MissionService(session, user)
    await service.remove_technology(mission_id, technology_id)
    return await service.detail(await service.get(mission_id))


# --- contact roles (shared referential) ---------------------------------------------------


@roles_router.get("", response_model=list[RoleWithUsage])
async def list_roles(session: DbSession) -> list[RoleWithUsage]:
    return [
        RoleWithUsage(id=r.id, name_fr=r.name_fr, name_en=r.name_en, usage=usage)
        for r, usage in await RoleService(session).all_with_usage()
    ]


@roles_router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(body: RoleCreate, session: DbSession) -> RoleRead:
    return RoleRead.model_validate(await RoleService(session).create(body))


@roles_router.patch("/{role_id}", response_model=RoleRead)
async def update_role(role_id: uuid.UUID, body: RoleUpdate, session: DbSession) -> RoleRead:
    return RoleRead.model_validate(await RoleService(session).update(role_id, body))


@roles_router.delete("/{role_id}", status_code=NO_CONTENT)
async def delete_role(role_id: uuid.UUID, session: DbSession) -> Response:
    await RoleService(session).delete(role_id)
    return Response(status_code=NO_CONTENT)
