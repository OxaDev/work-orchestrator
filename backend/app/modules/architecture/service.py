"""Architectures, domains and relations (P8, ADR-0022, ADR-0023, ADR-0037).

Personal data scoped to the owner (ADR-0010); every link stays inside one client company.
"""

import uuid
from collections import defaultdict

from fastapi import status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import AppError, ErrorCode
from app.modules.architecture.links import ExternalLinkService, delete_external_links
from app.modules.architecture.models import (
    Architecture,
    ArchitectureDomain,
    Domain,
    DomainLayout,
    DomainRelation,
    DomainTechnology,
    LinkedEntity,
    MissionArchitecture,
    RelationType,
    SubjectDomain,
)
from app.modules.architecture.schemas import (
    ArchitectureCreate,
    ArchitectureDetail,
    ArchitectureSummary,
    ArchitectureUpdate,
    DomainCreate,
    DomainDetail,
    DomainRef,
    DomainSummary,
    DomainTechnologyRead,
    DomainUpdate,
    ExternalLinkRead,
    LinkedSubject,
    NodePosition,
    OrgUnitRef,
    RelationCreate,
    RelationRead,
    RelationUpdate,
)
from app.modules.auth.models import User
from app.modules.directory.models import Company, Contact, OrgUnit
from app.modules.directory.schemas import Summary
from app.modules.directory.service import summaries
from app.modules.documents.models import DocumentAttachment
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.modules.technologies.models import Technology
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import clean, normalize_text
from app.shared.tree import ancestor_ids, descendant_ids, ensure_valid_parent


def _unprocessable(code: ErrorCode) -> AppError:
    return AppError(code, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


def _company_mismatch() -> AppError:
    return _unprocessable(ErrorCode.DOMAIN_COMPANY_MISMATCH)


async def _drop_document_attachments(
    session: AsyncSession, entity_type: str, entity_id: uuid.UUID
) -> None:
    await session.execute(
        delete(DocumentAttachment).where(
            DocumentAttachment.entity_type == entity_type,
            DocumentAttachment.entity_id == entity_id,
        )
    )


class DomainService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    # --- reads -----------------------------------------------------------------------------

    async def get(self, domain_id: uuid.UUID) -> Domain:
        return await get_owned(self.session, Domain, domain_id, self.user.id, "domain")

    async def search(
        self,
        *,
        company_id: uuid.UUID | None,
        search: str | None,
        include_archived: bool,
    ) -> list[Domain]:
        query = owned(select(Domain), Domain, self.user.id)
        if company_id is not None:
            query = query.where(Domain.company_id == company_id)
        if search and (needle := search.strip().lower()):
            query = query.where(func.lower(Domain.name).like(f"%{needle}%"))
        if not include_archived:
            query = query.where(Domain.archived_at.is_(None))
        return list(await self.session.scalars(query.order_by(Domain.normalized_name)))

    async def _domains(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, Domain]:
        if not ids:
            return {}
        rows = await self.session.scalars(select(Domain).where(Domain.id.in_(ids)))
        return {row.id: row for row in rows}

    async def relation_reads(self, relations: list[DomainRelation]) -> list[RelationRead]:
        domains = await self._domains(
            list({r.source_id for r in relations} | {r.target_id for r in relations})
        )

        def ref(domain_id: uuid.UUID) -> DomainRef:
            domain = domains[domain_id]
            return DomainRef(id=domain.id, name=domain.name, kind=domain.kind)

        return [
            RelationRead(
                id=r.id,
                source=ref(r.source_id),
                target=ref(r.target_id),
                type=r.type,
                label=r.label,
                protocol=r.protocol,
                sync_mode=r.sync_mode,
                lifecycle=r.lifecycle,
                description=r.description,
            )
            for r in relations
        ]

    async def detail(self, domain: Domain) -> DomainDetail:
        await self.session.refresh(domain)
        ancestors_ids = await ancestor_ids(self.session, Domain, domain.id)
        ancestors = await self._domains(ancestors_ids)
        children = await self.session.scalars(
            select(Domain).where(Domain.parent_id == domain.id).order_by(Domain.normalized_name)
        )
        relations = list(
            await self.session.scalars(
                select(DomainRelation)
                .where(
                    (DomainRelation.source_id == domain.id)
                    | (DomainRelation.target_id == domain.id)
                )
                .order_by(DomainRelation.created_at)
            )
        )
        reads = await self.relation_reads(relations)
        technologies = [
            DomainTechnologyRead(
                technology=Summary(id=tech.id, name=tech.name),
                category=tech.category,
                version=link.version,
            )
            for link, tech in await self.session.execute(
                select(DomainTechnology, Technology)
                .join(Technology, Technology.id == DomainTechnology.technology_id)
                .where(DomainTechnology.domain_id == domain.id)
                .order_by(Technology.normalized_name)
            )
        ]
        subjects = [
            LinkedSubject(
                id=s.id, title=s.title, scope=s.scope, mission_id=s.mission_id, status=s.status
            )
            for s in await self.session.scalars(
                select(Subject)
                .join(SubjectDomain, SubjectDomain.subject_id == Subject.id)
                .where(SubjectDomain.domain_id == domain.id)
                .order_by(func.lower(Subject.title))
            )
        ]
        architectures = [
            Summary(id=a.id, name=a.name)
            for a in await self.session.scalars(
                select(Architecture)
                .where(
                    Architecture.id.in_(
                        select(ArchitectureDomain.architecture_id).where(
                            ArchitectureDomain.domain_id.in_([domain.id, *ancestors_ids])
                        )
                    )
                )
                .order_by(Architecture.normalized_name)
            )
        ]
        chain: list[OrgUnitRef] = []
        if domain.owner_org_unit_id is not None:
            unit_ids = [
                *reversed(await ancestor_ids(self.session, OrgUnit, domain.owner_org_unit_id)),
                domain.owner_org_unit_id,
            ]
            units = {
                u.id: u
                for u in await self.session.scalars(select(OrgUnit).where(OrgUnit.id.in_(unit_ids)))
            }
            chain = [
                OrgUnitRef(id=u, name=units[u].name, level_label=units[u].level_label)
                for u in unit_ids
            ]
        contact = (
            await self.session.get(Contact, domain.referent_contact_id)
            if domain.referent_contact_id
            else None
        )
        company = (await summaries(self.session, Company, {domain.company_id}))[domain.company_id]
        links = await ExternalLinkService(self.session, self.user).for_entity(
            LinkedEntity.DOMAIN, domain.id
        )
        return DomainDetail(
            **DomainSummary.model_validate(domain).model_dump(),
            company=company,
            description=domain.description,
            owner_org_unit=chain[-1] if chain else None,
            owner_chain=chain,
            referent_contact=Summary(
                id=contact.id, name=f"{contact.first_name} {contact.last_name}"
            )
            if contact
            else None,
            ancestors=[DomainSummary.model_validate(ancestors[a]) for a in reversed(ancestors_ids)],
            children=[DomainSummary.model_validate(c) for c in children],
            outgoing=[r for r in reads if r.source.id == domain.id],
            incoming=[r for r in reads if r.target.id == domain.id],
            technologies=technologies,
            subjects=subjects,
            architectures=architectures,
            external_links=[ExternalLinkRead.model_validate(link) for link in links],
        )

    # --- writes ----------------------------------------------------------------------------

    async def _check_company(self, company_id: uuid.UUID) -> None:
        if await self.session.get(Company, company_id) is None:
            raise not_found("company")

    async def _check_people(
        self,
        company_id: uuid.UUID,
        org_unit_id: uuid.UUID | None,
        contact_id: uuid.UUID | None,
    ) -> None:
        if org_unit_id is not None:
            unit = await self.session.get(OrgUnit, org_unit_id)
            if unit is None:
                raise not_found("orgUnit")
            if unit.company_id != company_id:
                raise _company_mismatch()
        if contact_id is not None and await self.session.get(Contact, contact_id) is None:
            raise not_found("contact")

    async def _unique_sibling(
        self,
        company_id: uuid.UUID,
        parent_id: uuid.UUID | None,
        name: str,
        exclude: uuid.UUID | None = None,
    ) -> str:
        normalized = normalize_text(name)
        query = owned(select(Domain.id), Domain, self.user.id).where(
            Domain.company_id == company_id,
            Domain.normalized_name == normalized,
            Domain.parent_id.is_(None) if parent_id is None else Domain.parent_id == parent_id,
        )
        if exclude is not None:
            query = query.where(Domain.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("domain")
        return normalized

    async def create(self, data: DomainCreate) -> Domain:
        await self._check_company(data.company_id)
        if data.parent_id is not None and (await self.get(data.parent_id)).company_id != (
            data.company_id
        ):
            raise _company_mismatch()
        await self._check_people(data.company_id, data.owner_org_unit_id, data.referent_contact_id)
        architecture = (
            await ArchitectureService(self.session, self.user).get(data.architecture_id)
            if data.architecture_id
            else None
        )
        if architecture is not None and architecture.company_id != data.company_id:
            raise _company_mismatch()
        domain = Domain(
            owner_id=self.user.id,
            company_id=data.company_id,
            parent_id=data.parent_id,
            name=data.name.strip(),
            normalized_name=await self._unique_sibling(data.company_id, data.parent_id, data.name),
            kind=data.kind,
            description=data.description,
            criticality=data.criticality,
            lifecycle=data.lifecycle,
            owner_org_unit_id=data.owner_org_unit_id,
            referent_contact_id=data.referent_contact_id,
        )
        self.session.add(domain)
        await self.session.flush()
        if architecture is not None:
            self.session.add(
                ArchitectureDomain(architecture_id=architecture.id, domain_id=domain.id)
            )
        await self.session.commit()
        return domain

    async def update(self, domain_id: uuid.UUID, data: DomainUpdate) -> Domain:
        domain = await self.get(domain_id)
        fields = data.model_fields_set
        parent_id = data.parent_id if "parent_id" in fields else domain.parent_id
        if parent_id != domain.parent_id and parent_id is not None:
            if (await self.get(parent_id)).company_id != domain.company_id:
                raise _company_mismatch()
            await ensure_valid_parent(self.session, Domain, domain.id, parent_id)  # RG-08
        name = data.name.strip() if data.name is not None else domain.name
        if name != domain.name or parent_id != domain.parent_id:
            domain.normalized_name = await self._unique_sibling(
                domain.company_id, parent_id, name, domain.id
            )
        domain.name, domain.parent_id = name, parent_id
        org_unit = (
            data.owner_org_unit_id if "owner_org_unit_id" in fields else domain.owner_org_unit_id
        )
        contact = (
            data.referent_contact_id
            if "referent_contact_id" in fields
            else domain.referent_contact_id
        )
        await self._check_people(domain.company_id, org_unit, contact)
        domain.owner_org_unit_id, domain.referent_contact_id = org_unit, contact
        if data.kind is not None:
            domain.kind = data.kind
        if data.description is not None:
            domain.description = data.description
        if "criticality" in fields:
            domain.criticality = data.criticality
        if data.lifecycle is not None:
            domain.lifecycle = data.lifecycle
        await self.session.commit()
        return domain

    async def set_archived(self, domain_id: uuid.UUID, archived: bool) -> Domain:
        """Archiving or restoring applies to the whole subtree."""
        domain = await self.get(domain_id)
        subtree = {domain.id} | await descendant_ids(self.session, Domain, domain.id)
        await self.session.execute(
            update(Domain)
            .where(Domain.id.in_(subtree))
            .values(archived_at=utcnow() if archived else None)
            .execution_options(synchronize_session="fetch")
        )
        await self.session.commit()
        return domain

    async def delete(self, domain_id: uuid.UUID) -> None:
        """Refused while sub-domains exist; relations and links go with the domain (ADR-0037)."""
        domain = await self.get(domain_id)
        if await self.session.scalar(
            select(Domain.id).where(Domain.parent_id == domain.id).limit(1)
        ):
            raise entity_referenced("domain", "domain")
        await delete_external_links(self.session, LinkedEntity.DOMAIN, domain.id)
        await _drop_document_attachments(self.session, "domain", domain.id)
        await self.session.delete(domain)
        await self.session.commit()

    async def set_technology(
        self, domain_id: uuid.UUID, technology_id: uuid.UUID, version: str | None
    ) -> None:
        domain = await self.get(domain_id)
        if await self.session.get(Technology, technology_id) is None:
            raise not_found("technology")
        link = await self.session.get(DomainTechnology, (domain.id, technology_id))
        if link is None:
            link = DomainTechnology(domain_id=domain.id, technology_id=technology_id)
            self.session.add(link)
        link.version = clean(version)
        await self.session.commit()

    async def remove_technology(self, domain_id: uuid.UUID, technology_id: uuid.UUID) -> None:
        domain = await self.get(domain_id)
        link = await self.session.get(DomainTechnology, (domain.id, technology_id))
        if link is None:
            raise not_found("domainTechnology")
        await self.session.delete(link)
        await self.session.commit()

    async def link_subject(self, domain_id: uuid.UUID, subject_id: uuid.UUID) -> None:
        """Q-G5; a mission subject only links domains of that mission's client (ADR-0037)."""
        domain = await self.get(domain_id)
        subject = await get_owned(self.session, Subject, subject_id, self.user.id, "subject")
        if subject.mission_id is not None:
            mission = await self.session.get(Mission, subject.mission_id)
            if mission is not None and mission.client_id != domain.company_id:
                raise _company_mismatch()
        if await self.session.get(SubjectDomain, (subject.id, domain.id)) is None:
            self.session.add(SubjectDomain(subject_id=subject.id, domain_id=domain.id))
            await self.session.commit()

    async def unlink_subject(self, domain_id: uuid.UUID, subject_id: uuid.UUID) -> None:
        domain = await self.get(domain_id)
        link = await self.session.get(SubjectDomain, (subject_id, domain.id))
        if link is None:
            raise not_found("subjectDomain")
        await self.session.delete(link)
        await self.session.commit()


class RelationService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user
        self.domains = DomainService(session, user)

    async def get(self, relation_id: uuid.UUID) -> DomainRelation:
        return await get_owned(
            self.session, DomainRelation, relation_id, self.user.id, "domainRelation"
        )

    async def _check(
        self, source_id: uuid.UUID, target_id: uuid.UUID, kind: RelationType, label: str | None
    ) -> None:
        if source_id == target_id:
            raise _unprocessable(ErrorCode.RELATION_SELF)  # RG-09
        source, target = await self.domains.get(source_id), await self.domains.get(target_id)
        if source.company_id != target.company_id:
            raise _company_mismatch()
        if kind == RelationType.CUSTOM and not label:
            raise _unprocessable(ErrorCode.RELATION_LABEL_REQUIRED)

    async def create(self, data: RelationCreate) -> DomainRelation:
        label = clean(data.label)
        await self._check(data.source_id, data.target_id, data.type, label)
        relation = DomainRelation(
            owner_id=self.user.id,
            source_id=data.source_id,
            target_id=data.target_id,
            type=data.type,
            label=label,
            protocol=clean(data.protocol),
            sync_mode=data.sync_mode,
            lifecycle=data.lifecycle,
            description=data.description,
        )
        self.session.add(relation)
        await self.session.commit()
        return relation

    async def update(self, relation_id: uuid.UUID, data: RelationUpdate) -> DomainRelation:
        relation = await self.get(relation_id)
        fields = data.model_fields_set
        source = data.source_id or relation.source_id
        target = data.target_id or relation.target_id
        kind = data.type or relation.type
        label = clean(data.label) if "label" in fields else relation.label
        await self._check(source, target, kind, label)
        relation.source_id, relation.target_id, relation.type, relation.label = (
            source,
            target,
            kind,
            label,
        )
        if "protocol" in fields:
            relation.protocol = clean(data.protocol)
        if "sync_mode" in fields:
            relation.sync_mode = data.sync_mode
        if data.lifecycle is not None:
            relation.lifecycle = data.lifecycle
        if data.description is not None:
            relation.description = data.description
        await self.session.commit()
        return relation

    async def delete(self, relation_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(relation_id))
        await self.session.commit()


class ArchitectureService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def get(self, architecture_id: uuid.UUID) -> Architecture:
        return await get_owned(
            self.session, Architecture, architecture_id, self.user.id, "architecture"
        )

    async def search(
        self,
        *,
        company_id: uuid.UUID | None,
        mission_id: uuid.UUID | None,
        search: str | None,
        include_archived: bool,
    ) -> list[Architecture]:
        query = owned(select(Architecture), Architecture, self.user.id)
        if company_id is not None:
            query = query.where(Architecture.company_id == company_id)
        if mission_id is not None:
            query = query.where(
                Architecture.id.in_(
                    select(MissionArchitecture.architecture_id).where(
                        MissionArchitecture.mission_id == mission_id
                    )
                )
            )
        if search and (needle := search.strip().lower()):
            query = query.where(func.lower(Architecture.name).like(f"%{needle}%"))
        if not include_archived:
            query = query.where(Architecture.archived_at.is_(None))
        return list(await self.session.scalars(query.order_by(Architecture.normalized_name)))

    async def summaries(self, rows: list[Architecture]) -> list[ArchitectureSummary]:
        ids = [a.id for a in rows]
        counts = {
            arch_id: int(count)
            for arch_id, count in await self.session.execute(
                select(ArchitectureDomain.architecture_id, func.count())
                .where(ArchitectureDomain.architecture_id.in_(ids))
                .group_by(ArchitectureDomain.architecture_id)
            )
        }
        missions: dict[uuid.UUID, list[Summary]] = defaultdict(list)
        for arch_id, mission in await self.session.execute(
            select(MissionArchitecture.architecture_id, Mission)
            .join(Mission, Mission.id == MissionArchitecture.mission_id)
            .where(MissionArchitecture.architecture_id.in_(ids))
            .order_by(Mission.start_date)
        ):
            missions[arch_id].append(Summary(id=mission.id, name=mission.title))
        companies = await summaries(self.session, Company, {a.company_id for a in rows})
        return [
            ArchitectureSummary(
                id=a.id,
                company=companies[a.company_id],
                name=a.name,
                lifecycle=a.lifecycle,
                archived_at=a.archived_at,
                member_count=counts.get(a.id, 0),
                missions=missions[a.id],
            )
            for a in rows
        ]

    async def detail(self, architecture: Architecture) -> ArchitectureDetail:
        await self.session.refresh(architecture)
        summary = (await self.summaries([architecture]))[0]
        members = await self.session.scalars(
            select(Domain)
            .join(ArchitectureDomain, ArchitectureDomain.domain_id == Domain.id)
            .where(ArchitectureDomain.architecture_id == architecture.id)
            .order_by(Domain.normalized_name)
        )
        return ArchitectureDetail(
            **summary.model_dump(),
            description=architecture.description,
            members=[DomainSummary.model_validate(d) for d in members],
            updated_at=architecture.updated_at,
        )

    async def _unique(
        self, company_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None
    ) -> str:
        normalized = normalize_text(name)
        query = owned(select(Architecture.id), Architecture, self.user.id).where(
            Architecture.company_id == company_id, Architecture.normalized_name == normalized
        )
        if exclude is not None:
            query = query.where(Architecture.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("architecture")
        return normalized

    async def _mission_for(self, architecture: Architecture, mission_id: uuid.UUID) -> Mission:
        mission = await get_owned(self.session, Mission, mission_id, self.user.id, "mission")
        if mission.client_id != architecture.company_id:
            raise _unprocessable(ErrorCode.ARCHITECTURE_COMPANY_MISMATCH)
        return mission

    async def create(self, data: ArchitectureCreate) -> Architecture:
        if await self.session.get(Company, data.company_id) is None:
            raise not_found("company")
        architecture = Architecture(
            owner_id=self.user.id,
            company_id=data.company_id,
            name=data.name.strip(),
            normalized_name=await self._unique(data.company_id, data.name),
            description=data.description,
            lifecycle=data.lifecycle,
        )
        if data.mission_id is not None:
            await self._mission_for(architecture, data.mission_id)
        self.session.add(architecture)
        await self.session.flush()
        if data.mission_id is not None:
            self.session.add(
                MissionArchitecture(mission_id=data.mission_id, architecture_id=architecture.id)
            )
        await self.session.commit()
        return architecture

    async def update(self, architecture_id: uuid.UUID, data: ArchitectureUpdate) -> Architecture:
        architecture = await self.get(architecture_id)
        if data.name is not None:
            architecture.normalized_name = await self._unique(
                architecture.company_id, data.name, architecture.id
            )
            architecture.name = data.name.strip()
        if data.description is not None:
            architecture.description = data.description
        if data.lifecycle is not None:
            architecture.lifecycle = data.lifecycle
        await self.session.commit()
        return architecture

    async def set_archived(self, architecture_id: uuid.UUID, archived: bool) -> Architecture:
        architecture = await self.get(architecture_id)
        architecture.archived_at = utcnow() if archived else None
        await self.session.commit()
        return architecture

    async def delete(self, architecture_id: uuid.UUID) -> None:
        """Its domains stay: they belong to the client company (ADR-0023)."""
        architecture = await self.get(architecture_id)
        await _drop_document_attachments(self.session, "architecture", architecture.id)
        await self.session.delete(architecture)
        await self.session.commit()

    async def add_member(self, architecture_id: uuid.UUID, domain_id: uuid.UUID) -> None:
        architecture = await self.get(architecture_id)
        domain = await DomainService(self.session, self.user).get(domain_id)
        if domain.company_id != architecture.company_id:
            raise _company_mismatch()  # Q-H2
        if await self.session.get(ArchitectureDomain, (architecture.id, domain.id)) is None:
            self.session.add(
                ArchitectureDomain(architecture_id=architecture.id, domain_id=domain.id)
            )
            await self.session.commit()

    async def remove_member(self, architecture_id: uuid.UUID, domain_id: uuid.UUID) -> None:
        architecture = await self.get(architecture_id)
        link = await self.session.get(ArchitectureDomain, (architecture.id, domain_id))
        if link is None:
            raise not_found("architectureDomain")
        await self.session.delete(link)
        await self.session.commit()

    async def link_mission(
        self, architecture_id: uuid.UUID, mission_id: uuid.UUID, linked: bool
    ) -> None:
        architecture = await self.get(architecture_id)
        mission = await self._mission_for(architecture, mission_id)
        link = await self.session.get(MissionArchitecture, (mission.id, architecture.id))
        if linked and link is None:
            self.session.add(
                MissionArchitecture(mission_id=mission.id, architecture_id=architecture.id)
            )
        elif not linked:
            if link is None:
                raise not_found("missionArchitecture")
            await self.session.delete(link)
        await self.session.commit()

    # --- manual positions in the graph view (ADR-0025, ADR-0038) ---------------------------

    async def layout(self, architecture_id: uuid.UUID) -> list[NodePosition]:
        architecture = await self.get(architecture_id)
        rows = await self.session.scalars(
            select(DomainLayout).where(DomainLayout.architecture_id == architecture.id)
        )
        return [NodePosition(domain_id=r.domain_id, x=r.x, y=r.y) for r in rows]

    async def save_layout(
        self, architecture_id: uuid.UUID, positions: list[NodePosition]
    ) -> list[NodePosition]:
        """Upserts the given positions; others are kept."""
        architecture = await self.get(architecture_id)
        wanted = {p.domain_id: p for p in positions}
        owned_ids = set(
            await self.session.scalars(
                owned(select(Domain.id), Domain, self.user.id).where(
                    Domain.id.in_(wanted), Domain.company_id == architecture.company_id
                )
            )
        )
        if owned_ids != set(wanted):
            raise not_found("domain")
        existing = {
            row.domain_id: row
            for row in await self.session.scalars(
                select(DomainLayout).where(
                    DomainLayout.architecture_id == architecture.id,
                    DomainLayout.domain_id.in_(wanted),
                )
            )
        }
        for domain_id, position in wanted.items():
            row = existing.get(domain_id)
            if row is None:
                row = DomainLayout(architecture_id=architecture.id, domain_id=domain_id)
                self.session.add(row)
            row.x, row.y = position.x, position.y
        await self.session.commit()
        return await self.layout(architecture.id)

    async def clear_layout(self, architecture_id: uuid.UUID) -> None:
        architecture = await self.get(architecture_id)
        await self.session.execute(
            delete(DomainLayout).where(DomainLayout.architecture_id == architecture.id)
        )
        await self.session.commit()
