"""Project endpoints (ADR-0042). Personal data: always scoped to the current user (ADR-0010)."""

import uuid

from fastapi import APIRouter, Response, status

from app.modules.auth.dependencies import CurrentUser, DbSession
from app.modules.projects.schemas import ProjectCreate, ProjectSummary, ProjectUpdate
from app.modules.projects.service import ProjectService
from app.shared.schemas import IncludeArchived, Limit, Offset, Page, Search

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectSummary])
async def list_projects(
    user: CurrentUser,
    session: DbSession,
    mission_id: uuid.UUID | None = None,
    q: Search = None,
    include_archived: IncludeArchived = False,
    limit: Limit = 100,
    offset: Offset = 0,
) -> Page[ProjectSummary]:
    service = ProjectService(session, user)
    items, total = await service.search(
        mission_id=mission_id,
        search=q,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return Page(items=await service.summaries(items), total=total)


@router.post("", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate, user: CurrentUser, session: DbSession
) -> ProjectSummary:
    service = ProjectService(session, user)
    return await service.summary(await service.create(body))


@router.get("/{project_id}", response_model=ProjectSummary)
async def read_project(
    project_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ProjectSummary:
    service = ProjectService(session, user)
    return await service.summary(await service.get(project_id))


@router.patch("/{project_id}", response_model=ProjectSummary)
async def update_project(
    project_id: uuid.UUID, body: ProjectUpdate, user: CurrentUser, session: DbSession
) -> ProjectSummary:
    service = ProjectService(session, user)
    return await service.summary(await service.update(project_id, body))


@router.post("/{project_id}/archive", response_model=ProjectSummary)
async def archive_project(
    project_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ProjectSummary:
    service = ProjectService(session, user)
    return await service.summary(await service.set_archived(project_id, True))


@router.post("/{project_id}/restore", response_model=ProjectSummary)
async def restore_project(
    project_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ProjectSummary:
    service = ProjectService(session, user)
    return await service.summary(await service.set_archived(project_id, False))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, user: CurrentUser, session: DbSession) -> Response:
    await ProjectService(session, user).delete(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
