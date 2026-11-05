import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.modules.tags.models import TaggableType
from app.modules.tags.service import set_tags, tags_by_entity
from app.modules.technologies.models import Technology, TechnologyCategory
from app.modules.technologies.schemas import TechnologyCreate, TechnologyRead, TechnologyUpdate
from app.shared.schemas import name_already_used, not_found
from app.shared.text import clean, normalize_text


def _clean_aliases(aliases: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for alias in aliases:
        if (stripped := alias.strip()) and normalize_text(stripped) not in seen:
            seen[normalize_text(stripped)] = stripped
    return list(seen.values())


class TechnologyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def to_read(self, technologies: list[Technology]) -> list[TechnologyRead]:
        tags = await tags_by_entity(
            self.session, TaggableType.TECHNOLOGY, [t.id for t in technologies]
        )
        return [
            TechnologyRead.model_validate(t).model_copy(update={"tags": tags.get(t.id, [])})
            for t in technologies
        ]

    async def search(
        self,
        *,
        search: str | None,
        category: TechnologyCategory | None,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Technology], int]:
        query = select(Technology)
        if search and (needle := normalize_text(search)):
            pattern = f"%{needle}%"
            query = query.where(
                or_(
                    Technology.normalized_name.like(pattern),
                    func.lower(func.array_to_string(Technology.aliases, " ")).like(pattern),
                )
            )
        if category is not None:
            query = query.where(Technology.category == category)
        if not include_archived:
            query = query.where(Technology.archived_at.is_(None))
        total = await self.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = await self.session.scalars(
            query.order_by(Technology.normalized_name).limit(limit).offset(offset)
        )
        return list(rows), total or 0

    async def get(self, technology_id: uuid.UUID) -> Technology:
        technology = await self.session.get(Technology, technology_id)
        if technology is None:
            raise not_found("technology")
        return technology

    async def find_by_name(self, name: str) -> Technology | None:
        return await self.session.scalar(
            select(Technology).where(Technology.normalized_name == normalize_text(name))
        )

    async def _ensure_unique(self, name: str, exclude: uuid.UUID | None = None) -> str:
        existing = await self.find_by_name(name)
        if existing is not None and existing.id != exclude:
            raise name_already_used("technology")
        return normalize_text(name)

    async def create(self, data: TechnologyCreate) -> Technology:
        name = data.name.strip()
        technology = Technology(
            name=name,
            normalized_name=await self._ensure_unique(name),
            category=data.category,
            aliases=_clean_aliases(data.aliases),
            description=data.description,
            website=str(data.website) if data.website else None,
        )
        self.session.add(technology)
        await self.session.flush()
        await set_tags(self.session, TaggableType.TECHNOLOGY, technology.id, data.tag_ids)
        await self.session.commit()
        return technology

    async def update(self, technology_id: uuid.UUID, data: TechnologyUpdate) -> Technology:
        technology = await self.get(technology_id)
        changes: dict[str, Any] = data.model_dump(exclude_unset=True)
        if "name" in changes and changes["name"] is not None:
            technology.name = changes["name"].strip()
            technology.normalized_name = await self._ensure_unique(technology.name, technology.id)
        if changes.get("category") is not None:
            technology.category = changes["category"]
        if changes.get("aliases") is not None:
            technology.aliases = _clean_aliases(changes["aliases"])
        if changes.get("description") is not None:
            technology.description = changes["description"]
        if "website" in changes:
            technology.website = clean(str(data.website)) if data.website else None
        if data.tag_ids is not None:
            await set_tags(self.session, TaggableType.TECHNOLOGY, technology.id, data.tag_ids)
        await self.session.commit()
        return technology

    async def set_archived(self, technology_id: uuid.UUID, archived: bool) -> Technology:
        technology = await self.get(technology_id)
        technology.archived_at = utcnow() if archived else None
        await self.session.commit()
        return technology
