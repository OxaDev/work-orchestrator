"""Entities documents can link to or be attached to (ADR-0036).

Each supported type knows how to find a visible entity's label and how to search entities for the
`[[` completion. Personal entities are restricted to their owner (ADR-0010).
"""

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import status
from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.modules.architecture.models import Architecture, Domain
from app.modules.auth.models import User
from app.modules.directory.models import Company, Contact
from app.modules.documents.models import Document
from app.modules.documents.wikilinks import LinkType
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.modules.technologies.models import Technology
from app.shared.schemas import not_found


@dataclass(frozen=True)
class EntityType:
    model: Any
    label: Any  # SQL expression giving the display label
    owned: bool


def _contact_label() -> Any:
    return Contact.first_name + literal(" ") + Contact.last_name


ENTITY_TYPES: dict[LinkType, EntityType] = {
    LinkType.DOCUMENT: EntityType(Document, Document.title, owned=True),
    LinkType.MISSION: EntityType(Mission, Mission.title, owned=True),
    LinkType.SUBJECT: EntityType(Subject, Subject.title, owned=True),
    LinkType.CONTACT: EntityType(Contact, _contact_label(), owned=False),
    LinkType.COMPANY: EntityType(Company, Company.name, owned=False),
    LinkType.TECHNOLOGY: EntityType(Technology, Technology.name, owned=False),
    # P8 (ADR-0037): personal, like their client's knowledge.
    LinkType.DOMAIN: EntityType(Domain, Domain.name, owned=True),
    LinkType.ARCHITECTURE: EntityType(Architecture, Architecture.name, owned=True),
}


def supported(kind: LinkType) -> EntityType:
    entity = ENTITY_TYPES.get(kind)
    if entity is None:
        raise AppError(
            ErrorCode.ENTITY_TYPE_NOT_SUPPORTED,
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            params={"type": kind.value},
        )
    return entity


async def labels(
    session: AsyncSession, user: User, kind: LinkType, ids: set[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """Labels of the visible entities among `ids` (missing or foreign ones are absent)."""
    entity = ENTITY_TYPES.get(kind)
    if entity is None or not ids:
        return {}
    query = select(entity.model.id, entity.label).where(entity.model.id.in_(ids))
    if entity.owned:
        query = query.where(entity.model.owner_id == user.id)
    # Never dict(result): a SQLAlchemy Result has keys() (see CLAUDE.md).
    return {row_id: label for row_id, label in await session.execute(query)}  # noqa: C416


async def ensure_visible(
    session: AsyncSession, user: User, kind: LinkType, entity_id: uuid.UUID
) -> str:
    supported(kind)
    found = await labels(session, user, kind, {entity_id})
    if entity_id not in found:
        raise not_found(kind.value)
    return found[entity_id]


async def search(
    session: AsyncSession, user: User, text: str, kinds: list[LinkType], limit: int
) -> list[tuple[LinkType, uuid.UUID, str]]:
    """Entities whose label contains `text` (case-insensitive), shortest labels first."""
    needle = f"%{text.strip().lower()}%"
    results: list[tuple[LinkType, uuid.UUID, str]] = []
    for kind in kinds:
        entity = ENTITY_TYPES.get(kind)
        if entity is None:
            continue
        query = select(entity.model.id, entity.label).where(func.lower(entity.label).like(needle))
        if entity.owned:
            query = query.where(entity.model.owner_id == user.id)
        if hasattr(entity.model, "archived_at"):
            query = query.where(entity.model.archived_at.is_(None))
        query = query.order_by(func.length(entity.label), entity.label).limit(limit)
        results.extend((kind, row_id, label) for row_id, label in await session.execute(query))
    results.sort(key=lambda item: (len(item[2]), item[2].lower()))
    return results[:limit]
