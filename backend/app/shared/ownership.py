"""Personal data ownership (ADR-0010).

Every personal table mixes in `OwnedMixin`; every query on it goes through `owned()` or
`get_owned()`, so a user can never read or change another user's rows. A foreign row is
reported as *not found* (404), never as forbidden, to avoid revealing that it exists.
"""

import uuid

from sqlalchemy import ForeignKey, Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.shared.schemas import not_found


class OwnedMixin:
    @declared_attr
    def owner_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805 - SQLAlchemy declared_attr
        return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


def owned[*Ts](query: Select[*Ts], model: type[OwnedMixin], owner_id: uuid.UUID) -> Select[*Ts]:
    """Restricts a SELECT to the rows of one owner."""
    return query.where(model.owner_id == owner_id)


async def get_owned[OwnedT: OwnedMixin](
    session: AsyncSession,
    model: type[OwnedT],
    row_id: uuid.UUID,
    owner_id: uuid.UUID,
    entity: str,
) -> OwnedT:
    row = await session.get(model, row_id)
    if row is None or row.owner_id != owner_id:
        raise not_found(entity)
    return row
