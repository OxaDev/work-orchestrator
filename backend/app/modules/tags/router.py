import uuid

from fastapi import APIRouter, Response, status

from app.modules.auth.dependencies import DbSession
from app.modules.tags.schemas import TagCreate, TagRead, TagUpdate, TagWithUsage
from app.modules.tags.service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagWithUsage])
async def list_tags(session: DbSession) -> list[TagWithUsage]:
    return [
        TagWithUsage(id=tag.id, name=tag.name, color=tag.color, usage=usage)
        for tag, usage in await TagService(session).all_with_usage()
    ]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, session: DbSession) -> TagRead:
    return TagRead.model_validate(await TagService(session).create(body))


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(tag_id: uuid.UUID, body: TagUpdate, session: DbSession) -> TagRead:
    return TagRead.model_validate(await TagService(session).update(tag_id, body))


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, session: DbSession) -> Response:
    await TagService(session).delete(tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
