"""Fictional demonstration data for development (`make seed`, P2-15). Never run in production.

All companies and people below are invented.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.directory.models import Company, CompanyType, Sector
from app.modules.directory.schemas import CompanyCreate, ContactCreate, OrgUnitCreate
from app.modules.directory.service import CompanyService, ContactService, OrgUnitService
from app.modules.tags.schemas import TagCreate
from app.modules.tags.service import TagService
from app.modules.technologies.schemas import TechnologyUpdate
from app.modules.technologies.service import TechnologyService
from app.shared.text import normalize_text

MARKER_COMPANY = "Banque Horizon"

if TYPE_CHECKING:
    from app.modules.auth.models import User


async def _sector_id(session: AsyncSession, name_fr: str) -> uuid.UUID | None:
    return await session.scalar(select(Sector.id).where(Sector.name_fr == name_fr))


async def seed_demo(session: AsyncSession) -> bool:
    """Returns False when demo data is already present."""
    if await session.scalar(
        select(Company.id).where(Company.normalized_name == normalize_text(MARKER_COMPANY))
    ):
        return False

    tags = TagService(session)
    critical = await tags.create(TagCreate(name="Critique", color="red"))
    legacy = await tags.create(TagCreate(name="Legacy", color="orange"))
    key_contact = await tags.create(TagCreate(name="Contact clé", color="teal"))

    companies = CompanyService(session)
    payment_sector = await _sector_id(session, "Paiement")
    bank = await companies.create(
        CompanyCreate.model_validate(
            {
                "name": MARKER_COMPANY,
                "types": [CompanyType.CLIENT],
                "primary_sector_id": await _sector_id(session, "Banque de détail"),
                "secondary_sector_ids": [payment_sector] if payment_sector else [],
                "website": "https://banque-horizon.example",
                "notes": "Client historique. **Fictif** — données de démonstration.",
                "tag_ids": [critical.id],
            }
        )
    )
    insurer = await companies.create(
        CompanyCreate(
            name="Assurances Atlas",
            types=[CompanyType.CLIENT],
            primary_sector_id=await _sector_id(session, "Assurance de biens"),
        )
    )
    await companies.create(
        CompanyCreate(
            name="Nordlys Retail",
            types=[CompanyType.CLIENT],
            primary_sector_id=await _sector_id(session, "E-commerce"),
        )
    )
    esn = await companies.create(
        CompanyCreate(
            name="Néo Consulting",
            types=[CompanyType.ESN],
            primary_sector_id=await _sector_id(session, "ESN"),
        )
    )

    units = OrgUnitService(session)
    dsi = await units.create(bank.id, OrgUnitCreate(name="DSI", level_label="Direction"))
    payments = await units.create(
        bank.id, OrgUnitCreate(name="Pôle Paiements", level_label="Pôle", parent_id=dsi.id)
    )
    cards = await units.create(
        bank.id, OrgUnitCreate(name="Équipe Cartes", level_label="Équipe", parent_id=payments.id)
    )
    await units.create(
        bank.id, OrgUnitCreate(name="Équipe Virements", level_label="Équipe", parent_id=payments.id)
    )
    data_unit = await units.create(
        bank.id, OrgUnitCreate(name="Pôle Data", level_label="Pôle", parent_id=dsi.id)
    )

    contacts = ContactService(session)
    people = [
        ("Claire", "Dumont", "Directrice des systèmes d'information", bank.id, dsi.id, [key_contact.id]),
        ("Hugo", "Lefèvre", "Responsable du pôle Paiements", bank.id, payments.id, [key_contact.id]),
        ("Inès", "Moreau", "Tech lead Cartes", bank.id, cards.id, []),
        ("Bastien", "Roux", "Product owner Virements", bank.id, None, []),
        ("Nadia", "Benali", "Data engineer", bank.id, data_unit.id, []),
        ("Paul", "Girard", "Architecte SI", insurer.id, None, []),
        ("Léa", "Fontaine", "Commerciale", esn.id, None, []),
        ("Marc", "Petit", "Manager", esn.id, None, []),
    ]  # fmt: skip
    for first, last, title, company_id, unit_id, tag_ids in people:
        await contacts.create(
            ContactCreate.model_validate(
                {
                    "first_name": first,
                    "last_name": last,
                    "job_title": title,
                    "email_work": f"{normalize_text(first)}.{normalize_text(last)}@example.com",
                    "company_id": company_id,
                    "org_unit_id": unit_id,
                    "tag_ids": tag_ids,
                }
            )
        )

    technologies = TechnologyService(session)
    for name in ("COBOL", "IBM MQ"):
        technology = await technologies.find_by_name(name)
        if technology is not None:
            await technologies.update(technology.id, TechnologyUpdate(tag_ids=[legacy.id]))
    return True


DEMO_MISSION_TITLE = "Horizon — Paiements"


async def seed_demo_missions(session: AsyncSession, owner: "User") -> bool:
    """Three fictional missions on two clients for `owner` (P3-9). False if already present."""
    from datetime import timedelta

    from app.core.clock import utcnow
    from app.modules.directory.models import Contact
    from app.modules.missions.models import ContactRole, Mission, MissionStatus
    from app.modules.missions.schemas import (
        MissionContactUpsert,
        MissionCreate,
        MissionTechnologyUpsert,
    )
    from app.modules.missions.service import MissionService

    exists = await session.scalar(
        select(Mission.id).where(Mission.owner_id == owner.id, Mission.title == DEMO_MISSION_TITLE)
    )
    if exists:
        return False

    async def company_id(name: str) -> uuid.UUID:
        found = await session.scalar(
            select(Company.id).where(Company.normalized_name == normalize_text(name))
        )
        assert found is not None, f"run seed_demo first: {name} missing"  # noqa: S101
        return found

    esn = await company_id("Néo Consulting")
    if owner.employer_company_id is None:
        owner.employer_company_id = esn
        await session.commit()

    today = utcnow().date()
    service = MissionService(session, owner)
    past = await service.create(
        MissionCreate(
            title="Horizon — Cartes",
            job_title="Développeur back-end",
            client_id=await company_id(MARKER_COMPANY),
            start_date=today - timedelta(days=540),
            planned_end_date=today - timedelta(days=200),
            actual_end_date=today - timedelta(days=200),
            status=MissionStatus.ENDED,
            review="Migration du moteur d'autorisation cartes terminée.",
        )
    )
    current = await service.create(
        MissionCreate(
            title=DEMO_MISSION_TITLE,
            job_title="Tech lead",
            client_id=await company_id(MARKER_COMPANY),
            start_date=today - timedelta(days=150),
            planned_end_date=today + timedelta(days=210),
            location="Paris La Défense",
            remote_policy="2 jours de télétravail par semaine",
            objectives="- Migrer les virements instantanés vers Kafka\n- Encadrer 4 développeurs",
        )
    )
    await service.create(
        MissionCreate(
            title="Atlas — Audit d'architecture",
            job_title="Architecte",
            client_id=await company_id("Assurances Atlas"),
            start_date=today + timedelta(days=60),
            status=MissionStatus.PROSPECT,
        )
    )

    roles = {r.name_fr: r.id for r in await session.scalars(select(ContactRole))}
    contacts = {c.last_name: c.id for c in await session.scalars(select(Contact))}
    for last_name, role in (
        ("Lefèvre", "Manager"),
        ("Moreau", "Tech lead"),
        ("Roux", "Product owner"),
    ):
        if last_name in contacts:
            await service.upsert_contact(
                current.id, contacts[last_name], MissionContactUpsert(role_id=roles.get(role))
            )
    if "Moreau" in contacts:
        await service.upsert_contact(
            past.id, contacts["Moreau"], MissionContactUpsert(role_id=roles.get("Collègue"))
        )
    technologies = TechnologyService(session)
    for name, weight, version in (
        ("Java", 5, "21"),
        ("Spring Boot", 5, "3.3"),
        ("Apache Kafka", 4, None),
        ("PostgreSQL", 3, "16"),
        ("Kubernetes", 2, None),
    ):
        technology = await technologies.find_by_name(name)
        if technology is not None:
            await service.upsert_technology(
                current.id, technology.id, MissionTechnologyUpsert(weight=weight, version=version)
            )
    return True
