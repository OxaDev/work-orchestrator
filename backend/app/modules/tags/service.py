"""Tag catalogue and tag assignment helpers used by taggable modules."""

import uuid
from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tags.models import Tag, TaggableType, Tagging
from app.modules.tags.schemas import TagCreate, TagUpdate
from app.shared.schemas import name_already_used, not_found
from app.shared.text import normalize_text


async def tags_by_entity(
    session: AsyncSession, entity_type: TaggableType, entity_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[Tag]]:
    """Tags of many entities in one query, sorted by name."""
    ids = list(entity_ids)
    result: dict[uuid.UUID, list[Tag]] = defaultdict(list)
    if not ids:
        return result
    rows = await session.execute(
        select(Tagging.entity_id, Tag)
        .join(Tag, Tag.id == Tagging.tag_id)
        .where(Tagging.entity_type == entity_type.value, Tagging.entity_id.in_(ids))
        .order_by(Tag.normalized_name)
    )
    for entity_id, tag in rows:
        result[entity_id].append(tag)
    return result


async def set_tags(
    session: AsyncSession,
    entity_type: TaggableType,
    entity_id: uuid.UUID,
    tag_ids: Iterable[uuid.UUID],
) -> None:
    """Replaces the tags of one entity. Unknown tag ids are rejected."""
    wanted = set(tag_ids)
    if wanted:
        found = set((await session.scalars(select(Tag.id).where(Tag.id.in_(wanted)))).all())
        if found != wanted:
            raise not_found("tag")
    await session.execute(
        delete(Tagging).where(
            Tagging.entity_type == entity_type.value, Tagging.entity_id == entity_id
        )
    )
    session.add_all(
        Tagging(tag_id=tag_id, entity_type=entity_type.value, entity_id=entity_id)
        for tag_id in wanted
    )


async def entity_ids_with_tag(
    session: AsyncSession, entity_type: TaggableType, tag_id: uuid.UUID
) -> list[uuid.UUID]:
    rows = await session.scalars(
        select(Tagging.entity_id).where(
            Tagging.entity_type == entity_type.value, Tagging.tag_id == tag_id
        )
    )
    return list(rows)


class TagService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all_with_usage(self) -> list[tuple[Tag, int]]:
        """Every tag with its usage count."""
        usage = func.count(Tagging.tag_id)
        rows = await self.session.execute(
            select(Tag, usage)
            .outerjoin(Tagging, Tagging.tag_id == Tag.id)
            .group_by(Tag.id)
            .order_by(Tag.normalized_name)
        )
        return [(tag, count) for tag, count in rows]

    async def get(self, tag_id: uuid.UUID) -> Tag:
        tag = await self.session.get(Tag, tag_id)
        if tag is None:
            raise not_found("tag")
        return tag

    async def _ensure_unique(self, name: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name)
        query = select(Tag.id).where(Tag.normalized_name == normalized)
        if exclude is not None:
            query = query.where(Tag.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("tag")
        return normalized

    async def create(self, data: TagCreate) -> Tag:
        name = data.name.strip()
        tag = Tag(name=name, normalized_name=await self._ensure_unique(name), color=data.color)
        self.session.add(tag)
        await self.session.commit()
        return tag

    async def update(self, tag_id: uuid.UUID, data: TagUpdate) -> Tag:
        tag = await self.get(tag_id)
        if data.name is not None:
            tag.name = data.name.strip()
            tag.normalized_name = await self._ensure_unique(tag.name, exclude=tag.id)
        if data.color is not None:
            tag.color = data.color
        await self.session.commit()
        return tag

    async def delete(self, tag_id: uuid.UUID) -> None:
        """Deleting a tag removes it from every entity (taggings cascade)."""
        tag = await self.get(tag_id)
        await self.session.delete(tag)
        await self.session.commit()
