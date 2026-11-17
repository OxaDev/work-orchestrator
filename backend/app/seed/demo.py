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


# --- demo architecture (P8-11, ADR-0037) -------------------------------------------------------

DEMO_ARCHITECTURE = "SI Banque Horizon"
DEMO_PROJECT = "Refonte des paiements"

# (name, kind, parent name, owner org unit, technologies)
DEMO_DOMAINS: list[tuple[str, str, str | None, str | None, list[str]]] = [
    ("Paiements", "BUSINESS_DOMAIN", None, "Pôle Paiements", []),
    ("Hub de paiements", "APPLICATION", "Paiements", "Équipe Virements", ["Java", "Spring Boot"]),
    ("API Paiements", "SERVICE", "Hub de paiements", "Équipe Virements", ["Spring Boot"]),
    ("Base Paiements", "DATABASE", "Hub de paiements", "Équipe Virements", ["PostgreSQL"]),
    ("Moteur de fraude", "SERVICE", "Hub de paiements", "Pôle Data", ["Python"]),
    ("Virements SEPA", "APPLICATION", "Paiements", "Équipe Virements", ["Java"]),
    ("Passerelle SWIFT", "EXTERNAL_SYSTEM", "Virements SEPA", None, []),
    ("Cartes", "BUSINESS_DOMAIN", None, "Équipe Cartes", []),
    ("Gestion des cartes", "APPLICATION", "Cartes", "Équipe Cartes", ["Java"]),
    ("API Cartes", "SERVICE", "Gestion des cartes", "Équipe Cartes", ["Spring Boot"]),
    ("Base Cartes", "DATABASE", "Gestion des cartes", "Équipe Cartes", ["Oracle Database"]),
    ("Autorisations", "APPLICATION", "Cartes", "Équipe Cartes", ["Java"]),
    ("Réseau CB", "EXTERNAL_SYSTEM", "Autorisations", None, []),
    ("Clients", "BUSINESS_DOMAIN", None, "DSI", []),
    ("Référentiel clients", "APPLICATION", "Clients", "Pôle Data", ["Java"]),
    ("API Clients", "SERVICE", "Référentiel clients", "Pôle Data", ["Spring Boot"]),
    ("Base Clients", "DATABASE", "Référentiel clients", "Pôle Data", ["PostgreSQL"]),
    ("Banque en ligne", "APPLICATION", "Clients", "DSI", ["React"]),
    ("BFF Web", "SERVICE", "Banque en ligne", "DSI", ["Node.js"]),
    ("Socle", "INFRASTRUCTURE", None, "DSI", ["Kubernetes"]),
    ("Bus d'événements", "MESSAGING", "Socle", "DSI", ["Apache Kafka"]),
    ("Topic paiements", "MESSAGING", "Bus d'événements", "Pôle Paiements", ["Apache Kafka"]),
    ("Identité", "SERVICE", "Socle", "DSI", []),
    ("Keycloak", "SERVICE", "Identité", "DSI", ["Keycloak"]),
    ("Entrepôt de données", "DATABASE", "Socle", "Pôle Data", ["Snowflake"]),
]

# (source, target, type, protocol, sync mode)
DEMO_RELATIONS: list[tuple[str, str, str, str | None, str | None]] = [
    ("BFF Web", "API Clients", "CALLS", "REST", "SYNC"),
    ("BFF Web", "API Paiements", "CALLS", "REST", "SYNC"),
    ("BFF Web", "API Cartes", "CALLS", "REST", "SYNC"),
    ("BFF Web", "Keycloak", "DEPENDS_ON", "OIDC", "SYNC"),
    ("API Paiements", "Base Paiements", "WRITES_TO", "JDBC", "SYNC"),
    ("API Paiements", "Base Paiements", "READS_FROM", "JDBC", "SYNC"),
    ("API Paiements", "Moteur de fraude", "CALLS", "gRPC", "SYNC"),
    ("API Paiements", "Topic paiements", "PUBLISHES_TO", "Kafka", "ASYNC"),
    ("API Paiements", "API Clients", "CALLS", "REST", "SYNC"),
    ("API Paiements", "Keycloak", "DEPENDS_ON", "OIDC", "SYNC"),
    ("Moteur de fraude", "Topic paiements", "SUBSCRIBES_TO", "Kafka", "ASYNC"),
    ("Moteur de fraude", "Entrepôt de données", "READS_FROM", "SQL", "SYNC"),
    ("Virements SEPA", "Topic paiements", "SUBSCRIBES_TO", "Kafka", "ASYNC"),
    ("Virements SEPA", "Passerelle SWIFT", "CALLS", "SFTP", "ASYNC"),
    ("Virements SEPA", "Base Paiements", "READS_FROM", "JDBC", "SYNC"),
    ("Virements SEPA", "API Clients", "CALLS", "REST", "SYNC"),
    ("API Cartes", "Base Cartes", "WRITES_TO", "JDBC", "SYNC"),
    ("API Cartes", "Base Cartes", "READS_FROM", "JDBC", "SYNC"),
    ("API Cartes", "API Clients", "CALLS", "REST", "SYNC"),
    ("API Cartes", "Keycloak", "DEPENDS_ON", "OIDC", "SYNC"),
    ("Autorisations", "Réseau CB", "CALLS", "ISO 8583", "SYNC"),
    ("Autorisations", "Base Cartes", "READS_FROM", "JDBC", "SYNC"),
    ("Autorisations", "Moteur de fraude", "CALLS", "gRPC", "SYNC"),
    ("Autorisations", "Topic paiements", "PUBLISHES_TO", "Kafka", "ASYNC"),
    ("API Clients", "Base Clients", "WRITES_TO", "JDBC", "SYNC"),
    ("API Clients", "Base Clients", "READS_FROM", "JDBC", "SYNC"),
    ("API Clients", "Keycloak", "DEPENDS_ON", "OIDC", "SYNC"),
    ("Entrepôt de données", "Topic paiements", "SUBSCRIBES_TO", "Kafka", "ASYNC"),
    ("Entrepôt de données", "Base Clients", "READS_FROM", "CDC", "ASYNC"),
    ("Banque en ligne", "Hub de paiements", "DEPENDS_ON", None, None),
]


async def seed_demo_architecture(session: AsyncSession, owner: "User") -> bool:
    """The demo client's information system: 25 domains on 3 levels, 30 relations (P8-11)."""
    from app.modules.architecture.models import (
        Architecture,
        ArchitectureDomain,
        Domain,
        DomainKind,
        DomainRelation,
        DomainTechnology,
        ProjectArchitecture,
        RelationType,
        SyncMode,
    )
    from app.modules.directory.models import OrgUnit
    from app.modules.missions.models import Mission
    from app.modules.projects.models import Project
    from app.modules.technologies.models import Technology

    bank_id = await session.scalar(
        select(Company.id).where(Company.normalized_name == normalize_text(MARKER_COMPANY))
    )
    if bank_id is None:
        return False
    if await session.scalar(
        select(Architecture.id).where(
            Architecture.owner_id == owner.id,
            Architecture.normalized_name == normalize_text(DEMO_ARCHITECTURE),
        )
    ):
        return False
    units = {
        u.name: u.id
        for u in await session.scalars(select(OrgUnit).where(OrgUnit.company_id == bank_id))
    }
    technologies = {t.name: t.id for t in await session.scalars(select(Technology))}
    architecture = Architecture(
        owner_id=owner.id,
        company_id=bank_id,
        name=DEMO_ARCHITECTURE,
        normalized_name=normalize_text(DEMO_ARCHITECTURE),
        description="Système d'information **fictif** de la banque de démonstration.",
    )
    session.add(architecture)
    domains: dict[str, Domain] = {}
    for name, kind, parent, unit, techs in DEMO_DOMAINS:
        domain = Domain(
            owner_id=owner.id,
            company_id=bank_id,
            parent_id=domains[parent].id if parent else None,
            name=name,
            normalized_name=normalize_text(name),
            kind=DomainKind(kind),
            description="",
            owner_org_unit_id=units.get(unit) if unit else None,
        )
        session.add(domain)
        await session.flush()
        domains[name] = domain
        session.add_all(
            DomainTechnology(domain_id=domain.id, technology_id=technologies[t])
            for t in techs
            if t in technologies
        )
        if parent is None:
            session.add(ArchitectureDomain(architecture_id=architecture.id, domain_id=domain.id))
    session.add_all(
        DomainRelation(
            owner_id=owner.id,
            source_id=domains[source].id,
            target_id=domains[target].id,
            type=RelationType(kind),
            protocol=protocol,
            sync_mode=SyncMode(mode) if mode else None,
            description="",
        )
        for source, target, kind, protocol, mode in DEMO_RELATIONS
    )
    mission_id = await session.scalar(
        select(Mission.id).where(Mission.owner_id == owner.id, Mission.title == DEMO_MISSION_TITLE)
    )
    if mission_id is not None:
        # ADR-0042: architectures reach a mission through one of its projects.
        project = Project(
            owner_id=owner.id,
            mission_id=mission_id,
            name=DEMO_PROJECT,
            normalized_name=normalize_text(DEMO_PROJECT),
            description="Projet de démonstration regroupant l'architecture et la documentation.",
        )
        session.add(project)
        await session.flush()
        session.add(ProjectArchitecture(project_id=project.id, architecture_id=architecture.id))
    await session.commit()
    return True
