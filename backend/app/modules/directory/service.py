"""Directory use cases: sectors, companies, organisation, contacts (P2, ADR-0031)."""

import uuid
from collections import defaultdict
from typing import Any

from fastapi import status
from sqlalchemy import Select, delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import AppError, ErrorCode
from app.modules.directory.models import (
    Company,
    CompanyType,
    Contact,
    ContactEmployment,
    OrgUnit,
    Sector,
    company_secondary_sectors,
)
from app.modules.directory.schemas import (
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    ContactCreate,
    ContactDetail,
    ContactRead,
    ContactUpdate,
    DuplicateCandidate,
    EmploymentCreate,
    EmploymentRead,
    OrgUnitCreate,
    OrgUnitUpdate,
    SectorCreate,
    SectorRead,
    SectorUpdate,
    Summary,
)
from app.modules.tags.models import TaggableType, Tagging
from app.modules.tags.schemas import TagRead
from app.modules.tags.service import set_tags, tags_by_entity
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import clean, normalize_text
from app.shared.tree import ancestor_ids, descendant_ids, ensure_valid_parent


async def _count(session: AsyncSession, query: Select[Any]) -> int:
    return await session.scalar(select(func.count()).select_from(query.subquery())) or 0


# --- sectors --------------------------------------------------------------------------------


class SectorService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all(self) -> list[SectorRead]:
        sectors = (await self.session.scalars(select(Sector).order_by(Sector.name_fr))).all()
        primary = await self.session.execute(
            select(Company.primary_sector_id, func.count())
            .where(Company.primary_sector_id.is_not(None))
            .group_by(Company.primary_sector_id)
        )
        secondary = await self.session.execute(
            select(company_secondary_sectors.c.sector_id, func.count()).group_by(
                company_secondary_sectors.c.sector_id
            )
        )
        counts: dict[uuid.UUID, int] = defaultdict(int)
        for sector_id, count in [*primary, *secondary]:
            counts[sector_id] += count
        return [
            SectorRead.model_validate(s).model_copy(update={"company_count": counts[s.id]})
            for s in sectors
        ]

    async def get(self, sector_id: uuid.UUID) -> Sector:
        sector = await self.session.get(Sector, sector_id)
        if sector is None:
            raise not_found("sector")
        return sector

    async def create(self, data: SectorCreate) -> Sector:
        if data.parent_id is not None:
            await self.get(data.parent_id)
        sector = Sector(
            name_fr=data.name_fr.strip(), name_en=data.name_en.strip(), parent_id=data.parent_id
        )
        self.session.add(sector)
        await self.session.commit()
        return sector

    async def update(self, sector_id: uuid.UUID, data: SectorUpdate) -> Sector:
        sector = await self.get(sector_id)
        if data.name_fr is not None:
            sector.name_fr = data.name_fr.strip()
        if data.name_en is not None:
            sector.name_en = data.name_en.strip()
        if "parent_id" in data.model_fields_set:
            if data.parent_id is not None:
                await self.get(data.parent_id)
            await ensure_valid_parent(self.session, Sector, sector.id, data.parent_id)
            sector.parent_id = data.parent_id
        await self.session.commit()
        return sector

    async def delete(self, sector_id: uuid.UUID) -> None:
        sector = await self.get(sector_id)
        if await self.session.scalar(select(Sector.id).where(Sector.parent_id == sector.id)):
            raise entity_referenced("sector", "sector")
        used = await self.session.scalar(
            select(Company.id)
            .outerjoin(
                company_secondary_sectors, company_secondary_sectors.c.company_id == Company.id
            )
            .where(
                or_(
                    Company.primary_sector_id == sector.id,
                    company_secondary_sectors.c.sector_id == sector.id,
                )
            )
            .limit(1)
        )
        if used is not None:
            raise entity_referenced("sector", "company")
        await self.session.delete(sector)
        await self.session.commit()


# --- companies ------------------------------------------------------------------------------


class CompanyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def to_read(self, companies: list[Company]) -> list[CompanyRead]:
        ids = [c.id for c in companies]
        tags = await tags_by_entity(self.session, TaggableType.COMPANY, ids)
        secondary: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        for company_id, sector_id in await self.session.execute(
            select(
                company_secondary_sectors.c.company_id, company_secondary_sectors.c.sector_id
            ).where(company_secondary_sectors.c.company_id.in_(ids))
        ):
            secondary[company_id].append(sector_id)
        parent_ids = {c.parent_company_id for c in companies if c.parent_company_id}
        parents = await summaries(self.session, Company, parent_ids)
        # Not dict(result): a SQLAlchemy Result has keys(), so dict() treats it as a mapping.
        contact_counts = {  # noqa: C416
            company_id: count
            for company_id, count in (
                await self.session.execute(
                    select(Contact.company_id, func.count())
                    .where(Contact.company_id.in_(ids), Contact.archived_at.is_(None))
                    .group_by(Contact.company_id)
                )
            )
        }
        return [
            CompanyRead(
                id=c.id,
                name=c.name,
                types=[CompanyType(t) for t in c.types],
                primary_sector_id=c.primary_sector_id,
                secondary_sector_ids=secondary.get(c.id, []),
                parent_company=parents.get(c.parent_company_id) if c.parent_company_id else None,
                website=c.website,
                notes=c.notes,
                tags=[TagRead.model_validate(t) for t in tags.get(c.id, [])],
                contact_count=contact_counts.get(c.id, 0),
                archived_at=c.archived_at,
                created_at=c.created_at,
            )
            for c in companies
        ]

    async def search(
        self,
        *,
        search: str | None,
        company_type: CompanyType | None,
        sector_id: uuid.UUID | None,
        tag_id: uuid.UUID | None,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Company], int]:
        query = select(Company)
        if search and (needle := normalize_text(search)):
            query = query.where(Company.normalized_name.like(f"%{needle}%"))
        if company_type is not None:
            query = query.where(Company.types.contains([company_type.value]))
        if sector_id is not None:
            in_secondary = select(company_secondary_sectors.c.company_id).where(
                company_secondary_sectors.c.sector_id == sector_id
            )
            query = query.where(
                or_(Company.primary_sector_id == sector_id, Company.id.in_(in_secondary))
            )
        if tag_id is not None:
            tagged = select(Tagging.entity_id).where(
                Tagging.entity_type == TaggableType.COMPANY.value, Tagging.tag_id == tag_id
            )
            query = query.where(Company.id.in_(tagged))
        if not include_archived:
            query = query.where(Company.archived_at.is_(None))
        total = await _count(self.session, query)
        rows = await self.session.scalars(
            query.order_by(Company.normalized_name).limit(limit).offset(offset)
        )
        return list(rows), total

    async def get(self, company_id: uuid.UUID) -> Company:
        company = await self.session.get(Company, company_id)
        if company is None:
            raise not_found("company")
        return company

    async def _unique_name(self, name: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name)
        query = select(Company.id).where(Company.normalized_name == normalized)
        if exclude is not None:
            query = query.where(Company.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("company")
        return normalized

    async def _check_sectors(self, sector_ids: set[uuid.UUID]) -> None:
        if not sector_ids:
            return
        found = set(
            (await self.session.scalars(select(Sector.id).where(Sector.id.in_(sector_ids)))).all()
        )
        if found != sector_ids:
            raise not_found("sector")

    async def _set_secondary_sectors(
        self, company_id: uuid.UUID, sector_ids: list[uuid.UUID]
    ) -> None:
        wanted = set(sector_ids)
        await self._check_sectors(wanted)
        await self.session.execute(
            delete(company_secondary_sectors).where(
                company_secondary_sectors.c.company_id == company_id
            )
        )
        if wanted:
            await self.session.execute(
                insert(company_secondary_sectors),
                [{"company_id": company_id, "sector_id": s} for s in wanted],
            )

    @staticmethod
    def _types(types: list[CompanyType]) -> list[str]:
        unique = list(dict.fromkeys(t.value for t in types))
        return unique or [CompanyType.OTHER.value]

    async def create(self, data: CompanyCreate) -> Company:
        name = data.name.strip()
        if data.primary_sector_id is not None:
            await self._check_sectors({data.primary_sector_id})
        if data.parent_company_id is not None:
            await self.get(data.parent_company_id)
        company = Company(
            name=name,
            normalized_name=await self._unique_name(name),
            types=self._types(data.types),
            primary_sector_id=data.primary_sector_id,
            parent_company_id=data.parent_company_id,
            website=str(data.website) if data.website else None,
            notes=data.notes,
        )
        self.session.add(company)
        await self.session.flush()
        await self._set_secondary_sectors(company.id, data.secondary_sector_ids)
        await set_tags(self.session, TaggableType.COMPANY, company.id, data.tag_ids)
        await self.session.commit()
        return company

    async def update(self, company_id: uuid.UUID, data: CompanyUpdate) -> Company:
        company = await self.get(company_id)
        fields = data.model_fields_set
        if data.name is not None:
            company.name = data.name.strip()
            company.normalized_name = await self._unique_name(company.name, company.id)
        if data.types is not None:
            company.types = self._types(data.types)
        if "primary_sector_id" in fields:
            if data.primary_sector_id is not None:
                await self._check_sectors({data.primary_sector_id})
            company.primary_sector_id = data.primary_sector_id
        if "parent_company_id" in fields:
            if data.parent_company_id is not None:
                await self.get(data.parent_company_id)
            await ensure_valid_parent(
                self.session, Company, company.id, data.parent_company_id, "parent_company_id"
            )
            company.parent_company_id = data.parent_company_id
        if "website" in fields:
            company.website = str(data.website) if data.website else None
        if data.notes is not None:
            company.notes = data.notes
        if data.secondary_sector_ids is not None:
            await self._set_secondary_sectors(company.id, data.secondary_sector_ids)
        if data.tag_ids is not None:
            await set_tags(self.session, TaggableType.COMPANY, company.id, data.tag_ids)
        await self.session.commit()
        return company

    async def set_archived(self, company_id: uuid.UUID, archived: bool) -> Company:
        company = await self.get(company_id)
        company.archived_at = utcnow() if archived else None
        await self.session.commit()
        return company


async def summaries(
    session: AsyncSession, model: Any, ids: set[uuid.UUID]
) -> dict[uuid.UUID, Summary]:
    """{id: Summary(id, name)} for Company or OrgUnit rows."""
    if not ids:
        return {}
    rows = await session.execute(select(model.id, model.name).where(model.id.in_(ids)))
    return {row_id: Summary(id=row_id, name=name) for row_id, name in rows}


# --- organisation ---------------------------------------------------------------------------


def _org_unit_mismatch() -> AppError:
    return AppError(
        ErrorCode.ORG_UNIT_COMPANY_MISMATCH, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
    )


class OrgUnitService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def for_company(self, company_id: uuid.UUID) -> list[OrgUnit]:
        await CompanyService(self.session).get(company_id)
        rows = await self.session.scalars(
            select(OrgUnit).where(OrgUnit.company_id == company_id).order_by(OrgUnit.name)
        )
        return list(rows)

    async def get(self, unit_id: uuid.UUID) -> OrgUnit:
        unit = await self.session.get(OrgUnit, unit_id)
        if unit is None:
            raise not_found("orgUnit")
        return unit

    async def _check_parent(self, company_id: uuid.UUID, parent_id: uuid.UUID | None) -> None:
        if parent_id is not None and (await self.get(parent_id)).company_id != company_id:
            raise _org_unit_mismatch()

    async def create(self, company_id: uuid.UUID, data: OrgUnitCreate) -> OrgUnit:
        await CompanyService(self.session).get(company_id)
        await self._check_parent(company_id, data.parent_id)
        unit = OrgUnit(
            company_id=company_id,
            parent_id=data.parent_id,
            name=data.name.strip(),
            level_label=data.level_label.strip(),
            description=data.description,
        )
        self.session.add(unit)
        await self.session.commit()
        return unit

    async def update(self, unit_id: uuid.UUID, data: OrgUnitUpdate) -> OrgUnit:
        unit = await self.get(unit_id)
        if data.name is not None:
            unit.name = data.name.strip()
        if data.level_label is not None:
            unit.level_label = data.level_label.strip()
        if data.description is not None:
            unit.description = data.description
        if "parent_id" in data.model_fields_set:
            await self._check_parent(unit.company_id, data.parent_id)
            await ensure_valid_parent(self.session, OrgUnit, unit.id, data.parent_id)
            unit.parent_id = data.parent_id
        await self.session.commit()
        return unit

    async def delete(self, unit_id: uuid.UUID) -> None:
        unit = await self.get(unit_id)
        if await self.session.scalar(select(OrgUnit.id).where(OrgUnit.parent_id == unit.id)):
            raise entity_referenced("orgUnit", "orgUnit")
        if await self.session.scalar(select(Contact.id).where(Contact.org_unit_id == unit.id)):
            raise entity_referenced("orgUnit", "contact")
        await self.session.delete(unit)
        await self.session.commit()

    async def ancestors(self, unit_id: uuid.UUID) -> list[OrgUnit]:
        await self.get(unit_id)
        ids = await ancestor_ids(self.session, OrgUnit, unit_id)
        by_id = {
            u.id: u for u in await self.session.scalars(select(OrgUnit).where(OrgUnit.id.in_(ids)))
        }
        return [by_id[i] for i in ids]

    async def descendants(self, unit_id: uuid.UUID) -> list[OrgUnit]:
        await self.get(unit_id)
        ids = await descendant_ids(self.session, OrgUnit, unit_id)
        rows = await self.session.scalars(
            select(OrgUnit).where(OrgUnit.id.in_(ids)).order_by(OrgUnit.name)
        )
        return list(rows)


# --- contacts -------------------------------------------------------------------------------


def _contact_key(first_name: str, last_name: str) -> str:
    return normalize_text(f"{first_name} {last_name}")


class ContactService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def to_read(self, contacts: list[Contact]) -> list[ContactRead]:
        companies = await summaries(
            self.session, Company, {c.company_id for c in contacts if c.company_id}
        )
        units = await summaries(
            self.session, OrgUnit, {c.org_unit_id for c in contacts if c.org_unit_id}
        )
        tags = await tags_by_entity(self.session, TaggableType.CONTACT, [c.id for c in contacts])
        return [
            ContactRead(
                id=c.id,
                first_name=c.first_name,
                last_name=c.last_name,
                job_title=c.job_title,
                email_work=c.email_work,
                email_personal=c.email_personal,
                phone_work=c.phone_work,
                phone_mobile=c.phone_mobile,
                linkedin_url=c.linkedin_url,
                notes=c.notes,
                company=companies.get(c.company_id) if c.company_id else None,
                org_unit=units.get(c.org_unit_id) if c.org_unit_id else None,
                tags=[TagRead.model_validate(t) for t in tags.get(c.id, [])],
                archived_at=c.archived_at,
                created_at=c.created_at,
            )
            for c in contacts
        ]

    async def detail(self, contact: Contact) -> ContactDetail:
        base = (await self.to_read([contact]))[0]
        return ContactDetail(**base.model_dump(), employments=await self.employments(contact.id))

    async def search(
        self,
        *,
        search: str | None,
        company_id: uuid.UUID | None,
        org_unit_id: uuid.UUID | None,
        tag_id: uuid.UUID | None,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Contact], int]:
        query = select(Contact)
        if search and (needle := normalize_text(search)):
            pattern = f"%{needle}%"
            query = query.where(
                or_(
                    Contact.normalized_name.like(pattern),
                    func.lower(Contact.email_work).like(pattern),
                    func.lower(Contact.email_personal).like(pattern),
                    func.lower(Contact.job_title).like(pattern),
                )
            )
        if company_id is not None:
            query = query.where(Contact.company_id == company_id)
        if org_unit_id is not None:
            query = query.where(Contact.org_unit_id == org_unit_id)
        if tag_id is not None:
            tagged = select(Tagging.entity_id).where(
                Tagging.entity_type == TaggableType.CONTACT.value, Tagging.tag_id == tag_id
            )
            query = query.where(Contact.id.in_(tagged))
        if not include_archived:
            query = query.where(Contact.archived_at.is_(None))
        total = await _count(self.session, query)
        rows = await self.session.scalars(
            query.order_by(Contact.last_name, Contact.first_name).limit(limit).offset(offset)
        )
        return list(rows), total

    async def get(self, contact_id: uuid.UUID) -> Contact:
        contact = await self.session.get(Contact, contact_id)
        if contact is None:
            raise not_found("contact")
        return contact

    async def _resolve_affiliation(
        self, company_id: uuid.UUID | None, org_unit_id: uuid.UUID | None
    ) -> uuid.UUID | None:
        """Checks the org unit belongs to the company; infers the company from the unit."""
        if company_id is not None:
            await CompanyService(self.session).get(company_id)
        if org_unit_id is None:
            return company_id
        unit = await OrgUnitService(self.session).get(org_unit_id)
        if company_id is not None and unit.company_id != company_id:
            raise _org_unit_mismatch()
        return unit.company_id

    async def duplicates(
        self,
        first_name: str,
        last_name: str,
        emails: list[str],
        exclude_id: uuid.UUID | None = None,
    ) -> list[DuplicateCandidate]:
        """Possible duplicates: same normalised full name, or a shared e-mail (P2-9)."""
        found: dict[uuid.UUID, tuple[Contact, str]] = {}
        key = _contact_key(first_name, last_name)
        for contact in await self.session.scalars(
            select(Contact).where(Contact.normalized_name == key)
        ):
            found[contact.id] = (contact, "SAME_NAME")
        lowered = [e.strip().lower() for e in emails if e and e.strip()]
        if lowered:
            for contact in await self.session.scalars(
                select(Contact).where(
                    or_(
                        func.lower(Contact.email_work).in_(lowered),
                        func.lower(Contact.email_personal).in_(lowered),
                    )
                )
            ):
                found.setdefault(contact.id, (contact, "SAME_EMAIL"))
        if exclude_id is not None:
            found.pop(exclude_id, None)
        companies = await summaries(
            self.session, Company, {c.company_id for c, _ in found.values() if c.company_id}
        )
        return [
            DuplicateCandidate(
                id=c.id,
                first_name=c.first_name,
                last_name=c.last_name,
                company=companies.get(c.company_id) if c.company_id else None,
                reason=reason,
            )
            for c, reason in found.values()
        ]

    async def create(self, data: ContactCreate) -> Contact:
        company_id = await self._resolve_affiliation(data.company_id, data.org_unit_id)
        first, last = data.first_name.strip(), data.last_name.strip()
        contact = Contact(
            first_name=first,
            last_name=last,
            normalized_name=_contact_key(first, last),
            job_title=clean(data.job_title),
            email_work=str(data.email_work).lower() if data.email_work else None,
            email_personal=str(data.email_personal).lower() if data.email_personal else None,
            phone_work=clean(data.phone_work),
            phone_mobile=clean(data.phone_mobile),
            linkedin_url=str(data.linkedin_url) if data.linkedin_url else None,
            notes=data.notes,
            company_id=company_id,
            org_unit_id=data.org_unit_id,
        )
        self.session.add(contact)
        await self.session.flush()
        await set_tags(self.session, TaggableType.CONTACT, contact.id, data.tag_ids)
        await self.session.commit()
        return contact

    async def update(self, contact_id: uuid.UUID, data: ContactUpdate) -> Contact:
        contact = await self.get(contact_id)
        fields = data.model_fields_set
        if data.first_name is not None:
            contact.first_name = data.first_name.strip()
        if data.last_name is not None:
            contact.last_name = data.last_name.strip()
        contact.normalized_name = _contact_key(contact.first_name, contact.last_name)

        if {"company_id", "org_unit_id"} & fields:
            company_id = data.company_id if "company_id" in fields else contact.company_id
            org_unit_id = data.org_unit_id if "org_unit_id" in fields else contact.org_unit_id
            if (
                "company_id" in fields
                and "org_unit_id" not in fields
                and company_id != contact.company_id
            ):
                org_unit_id = None  # the unit belonged to the previous company
            new_company_id = await self._resolve_affiliation(company_id, org_unit_id)
            if contact.company_id is not None and new_company_id != contact.company_id:
                # Keep track of the previous position (Q-D2).
                self.session.add(
                    ContactEmployment(
                        contact_id=contact.id,
                        company_id=contact.company_id,
                        job_title=contact.job_title,
                        end_date=utcnow().date(),
                    )
                )
            contact.company_id = new_company_id
            contact.org_unit_id = org_unit_id

        for field in ("job_title", "phone_work", "phone_mobile"):
            if field in fields:
                setattr(contact, field, clean(getattr(data, field)))
        for field in ("email_work", "email_personal"):
            if field in fields:
                value = getattr(data, field)
                setattr(contact, field, str(value).lower() if value else None)
        if "linkedin_url" in fields:
            contact.linkedin_url = str(data.linkedin_url) if data.linkedin_url else None
        if data.notes is not None:
            contact.notes = data.notes
        if data.tag_ids is not None:
            await set_tags(self.session, TaggableType.CONTACT, contact.id, data.tag_ids)
        await self.session.commit()
        return contact

    async def set_archived(self, contact_id: uuid.UUID, archived: bool) -> Contact:
        contact = await self.get(contact_id)
        contact.archived_at = utcnow() if archived else None
        await self.session.commit()
        return contact

    async def employments(self, contact_id: uuid.UUID) -> list[EmploymentRead]:
        rows = (
            await self.session.scalars(
                select(ContactEmployment)
                .where(ContactEmployment.contact_id == contact_id)
                .order_by(
                    ContactEmployment.end_date.desc().nulls_first(),
                    ContactEmployment.start_date.desc().nulls_last(),
                )
            )
        ).all()
        companies = await summaries(self.session, Company, {r.company_id for r in rows})
        return [
            EmploymentRead(
                id=r.id,
                company=companies[r.company_id],
                job_title=r.job_title,
                start_date=r.start_date,
                end_date=r.end_date,
            )
            for r in rows
        ]

    async def add_employment(self, contact_id: uuid.UUID, data: EmploymentCreate) -> None:
        await self.get(contact_id)
        await CompanyService(self.session).get(data.company_id)
        if data.start_date and data.end_date and data.end_date < data.start_date:
            raise AppError(
                ErrorCode.INVALID_DATE_RANGE, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
            )
        self.session.add(
            ContactEmployment(
                contact_id=contact_id,
                company_id=data.company_id,
                job_title=clean(data.job_title),
                start_date=data.start_date,
                end_date=data.end_date,
            )
        )
        await self.session.commit()

    async def delete_employment(self, contact_id: uuid.UUID, employment_id: uuid.UUID) -> None:
        employment = await self.session.get(ContactEmployment, employment_id)
        if employment is None or employment.contact_id != contact_id:
            raise not_found("employment")
        await self.session.delete(employment)
        await self.session.commit()
