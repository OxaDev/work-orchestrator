import uuid

from fastapi import APIRouter, status

from app.modules.auth.dependencies import DbSession
from app.modules.technologies.models import TechnologyCategory
from app.modules.technologies.schemas import TechnologyCreate, TechnologyRead, TechnologyUpdate
from app.modules.technologies.service import TechnologyService
from app.shared.schemas import IncludeArchived, Limit, Offset, Page, Search

router = APIRouter(prefix="/technologies", tags=["technologies"])


@router.get("", response_model=Page[TechnologyRead])
async def list_technologies(
    session: DbSession,
    q: Search = None,
    category: TechnologyCategory | None = None,
    include_archived: IncludeArchived = False,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[TechnologyRead]:
    service = TechnologyService(session)
    items, total = await service.search(
        search=q, category=category, include_archived=include_archived, limit=limit, offset=offset
    )
    return Page(items=await service.to_read(items), total=total)


@router.post("", response_model=TechnologyRead, status_code=status.HTTP_201_CREATED)
async def create_technology(body: TechnologyCreate, session: DbSession) -> TechnologyRead:
    service = TechnologyService(session)
    return (await service.to_read([await service.create(body)]))[0]


@router.get("/{technology_id}", response_model=TechnologyRead)
async def read_technology(technology_id: uuid.UUID, session: DbSession) -> TechnologyRead:
    service = TechnologyService(session)
    return (await service.to_read([await service.get(technology_id)]))[0]


@router.patch("/{technology_id}", response_model=TechnologyRead)
async def update_technology(
    technology_id: uuid.UUID, body: TechnologyUpdate, session: DbSession
) -> TechnologyRead:
    service = TechnologyService(session)
    return (await service.to_read([await service.update(technology_id, body)]))[0]


@router.post("/{technology_id}/archive", response_model=TechnologyRead)
async def archive_technology(technology_id: uuid.UUID, session: DbSession) -> TechnologyRead:
    service = TechnologyService(session)
    return (await service.to_read([await service.set_archived(technology_id, True)]))[0]


@router.post("/{technology_id}/restore", response_model=TechnologyRead)
async def restore_technology(technology_id: uuid.UUID, session: DbSession) -> TechnologyRead:
    service = TechnologyService(session)
    return (await service.to_read([await service.set_archived(technology_id, False)]))[0]
