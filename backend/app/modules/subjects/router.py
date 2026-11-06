"""Subject endpoints (P5-2). Personal data: always scoped to the current user (ADR-0010)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.modules.auth.dependencies import CurrentUser, DbSession
from app.modules.subjects.models import SubjectScope
from app.modules.subjects.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    CategoryWithUsage,
    SubjectCreate,
    SubjectRead,
    SubjectUpdate,
)
from app.modules.subjects.service import CategoryService, SubjectService
from app.shared.schemas import IncludeArchived, Search

router = APIRouter(prefix="/subjects", tags=["subjects"])
categories_router = APIRouter(prefix="/subject-categories", tags=["subject-categories"])

NO_CONTENT = status.HTTP_204_NO_CONTENT


@router.get("", response_model=list[SubjectRead])
async def list_subjects(
    user: CurrentUser,
    session: DbSession,
    mission_id: uuid.UUID | None = None,
    scope: Annotated[SubjectScope | None, Query()] = None,
    q: Search = None,
    include_archived: IncludeArchived = False,
) -> list[SubjectRead]:
    """Flat list (parent_id links); the client builds the tree (ADR-0022)."""
    service = SubjectService(session, user)
    return await service.reads(
        await service.search(
            mission_id=mission_id, scope=scope, search=q, include_archived=include_archived
        )
    )


@router.post("", response_model=SubjectRead, status_code=status.HTTP_201_CREATED)
async def create_subject(body: SubjectCreate, user: CurrentUser, session: DbSession) -> SubjectRead:
    service = SubjectService(session, user)
    return await service.read(await service.create(body))


@router.get("/{subject_id}", response_model=SubjectRead)
async def read_subject(subject_id: uuid.UUID, user: CurrentUser, session: DbSession) -> SubjectRead:
    service = SubjectService(session, user)
    return await service.read(await service.get(subject_id))


@router.patch("/{subject_id}", response_model=SubjectRead)
async def update_subject(
    subject_id: uuid.UUID, body: SubjectUpdate, user: CurrentUser, session: DbSession
) -> SubjectRead:
    """Edits a subject; `parent_id` moves it (RG-07, RG-08)."""
    service = SubjectService(session, user)
    return await service.read(await service.update(subject_id, body))


@router.post("/{subject_id}/archive", response_model=SubjectRead)
async def archive_subject(
    subject_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> SubjectRead:
    service = SubjectService(session, user)
    return await service.read(await service.set_archived(subject_id, True))


@router.post("/{subject_id}/restore", response_model=SubjectRead)
async def restore_subject(
    subject_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> SubjectRead:
    service = SubjectService(session, user)
    return await service.read(await service.set_archived(subject_id, False))


@router.delete("/{subject_id}", status_code=NO_CONTENT)
async def delete_subject(subject_id: uuid.UUID, user: CurrentUser, session: DbSession) -> Response:
    await SubjectService(session, user).delete(subject_id)
    return Response(status_code=NO_CONTENT)


# --- categories (shared referential) ------------------------------------------------------


@categories_router.get("", response_model=list[CategoryWithUsage])
async def list_categories(session: DbSession) -> list[CategoryWithUsage]:
    return [
        CategoryWithUsage(id=c.id, name_fr=c.name_fr, name_en=c.name_en, usage=usage)
        for c, usage in await CategoryService(session).all_with_usage()
    ]


@categories_router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, session: DbSession) -> CategoryRead:
    return CategoryRead.model_validate(await CategoryService(session).create(body))


@categories_router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: uuid.UUID, body: CategoryUpdate, session: DbSession
) -> CategoryRead:
    return CategoryRead.model_validate(await CategoryService(session).update(category_id, body))


@categories_router.delete("/{category_id}", status_code=NO_CONTENT)
async def delete_category(category_id: uuid.UUID, session: DbSession) -> Response:
    await CategoryService(session).delete(category_id)
    return Response(status_code=NO_CONTENT)
