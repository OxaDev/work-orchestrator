"""Reference and demo data (P2-15, ADR-0031)."""

from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import UserRole
from app.modules.directory.models import Company, Contact, Sector
from app.modules.missions.models import ContactRole, Mission, MissionContact, MissionTechnology
from app.modules.technologies.models import Technology
from app.seed.demo import seed_demo, seed_demo_missions
from app.seed.reference import (
    CONTACT_ROLES,
    HALF_DAY_SUBTYPES,
    SECTORS,
    TECHNOLOGIES,
    seed_reference,
)


async def _count(session: AsyncSession, model: object) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0  # type: ignore[arg-type]


async def test_reference_data_is_idempotent(db_session: AsyncSession) -> None:
    first = await seed_reference(db_session)
    expected_sectors = len(SECTORS) + sum(len(children) for _, _, children in SECTORS)
    assert first.sectors_added == expected_sectors
    assert first.technologies_added == len(TECHNOLOGIES)
    assert first.roles_added == len(CONTACT_ROLES)
    assert first.subtypes_added == len(HALF_DAY_SUBTYPES)
    assert len(TECHNOLOGIES) >= 150

    second = await seed_reference(db_session)
    assert (second.sectors_added, second.technologies_added, second.roles_added) == (0, 0, 0)
    assert second.subtypes_added == 0
    assert await _count(db_session, ContactRole) == len(CONTACT_ROLES)
    assert await _count(db_session, Sector) == expected_sectors
    assert await _count(db_session, Technology) == len(TECHNOLOGIES)


def test_reference_technology_names_are_unique() -> None:
    from app.shared.text import normalize_text

    names = [normalize_text(name) for name, _, _ in TECHNOLOGIES]
    assert len(names) == len(set(names))


async def test_demo_data_loads_once(db_session: AsyncSession) -> None:
    await seed_reference(db_session)
    assert await seed_demo(db_session) is True
    assert await _count(db_session, Company) == 4
    assert await _count(db_session, Contact) == 8
    assert await seed_demo(db_session) is False


@pytest.mark.parametrize("marker", ["Banque Horizon"])
async def test_demo_marker_company_exists(db_session: AsyncSession, marker: str) -> None:
    await seed_reference(db_session)
    await seed_demo(db_session)
    assert await db_session.scalar(select(Company.id).where(Company.name == marker)) is not None


async def test_demo_missions_for_an_owner(db_session: AsyncSession, make_user: Any) -> None:
    owner = await make_user("demo@example.com", role=UserRole.ADMIN)
    await seed_reference(db_session)
    await seed_demo(db_session)
    assert await seed_demo_missions(db_session, owner) is True
    assert await _count(db_session, Mission) == 3
    assert await _count(db_session, MissionContact) == 4
    assert await _count(db_session, MissionTechnology) == 5
    assert owner.employer_company_id is not None
    assert await seed_demo_missions(db_session, owner) is False
