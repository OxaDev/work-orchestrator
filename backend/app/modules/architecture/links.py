"""External links of domains, missions and subjects (Q-H9, ADR-0023, ADR-0037)."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.architecture.models import Domain, ExternalLink, LinkedEntity
from app.modules.architecture.schemas import ExternalLinkCreate, ExternalLinkUpdate
from app.modules.auth.models import User
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.shared.ownership import OwnedMixin, get_owned, owned

_MODELS: dict[LinkedEntity, type[OwnedMixin]] = {
    LinkedEntity.DOMAIN: Domain,
    LinkedEntity.MISSION: Mission,
    LinkedEntity.SUBJECT: Subject,
}


async def delete_external_links(
    session: AsyncSession, entity_type: LinkedEntity, entity_id: uuid.UUID
) -> None:
    """Called when the entity is deleted: polymorphic links have no foreign key."""
    await session.execute(
        delete(ExternalLink).where(
            ExternalLink.entity_type == entity_type, ExternalLink.entity_id == entity_id
        )
    )


class ExternalLinkService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def _check_entity(self, entity_type: LinkedEntity, entity_id: uuid.UUID) -> None:
        await get_owned(
            self.session, _MODELS[entity_type], entity_id, self.user.id, entity_type.value.lower()
        )

    async def for_entity(
        self, entity_type: LinkedEntity, entity_id: uuid.UUID
    ) -> list[ExternalLink]:
        rows = await self.session.scalars(
            owned(select(ExternalLink), ExternalLink, self.user.id)
            .where(ExternalLink.entity_type == entity_type, ExternalLink.entity_id == entity_id)
            .order_by(ExternalLink.kind, ExternalLink.label)
        )
        return list(rows)

    async def get(self, link_id: uuid.UUID) -> ExternalLink:
        return await get_owned(self.session, ExternalLink, link_id, self.user.id, "externalLink")

    async def create(self, data: ExternalLinkCreate) -> ExternalLink:
        await self._check_entity(data.entity_type, data.entity_id)
        link = ExternalLink(
            owner_id=self.user.id,
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            kind=data.kind,
            label=data.label.strip(),
            url=str(data.url),
        )
        self.session.add(link)
        await self.session.commit()
        return link

    async def update(self, link_id: uuid.UUID, data: ExternalLinkUpdate) -> ExternalLink:
        link = await self.get(link_id)
        if data.kind is not None:
            link.kind = data.kind
        if data.label is not None:
            link.label = data.label.strip()
        if data.url is not None:
            link.url = str(data.url)
        await self.session.commit()
        return link

    async def delete(self, link_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(link_id))
        await self.session.commit()
