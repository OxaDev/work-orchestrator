"""Mission use cases (P3, ADR-0017, ADR-0032). Every query is scoped to the owner (ADR-0010)."""

import uuid
from collections import Counter
from datetime import date

from fastapi import status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import AppError, ErrorCode
from app.modules.auth.models import User
from app.modules.directory.models import Company, Contact
from app.modules.directory.schemas import Summary
from app.modules.directory.service import CompanyService, ContactService, summaries
from app.modules.missions.models import (
    ContactRole,
    Mission,
    MissionContact,
    MissionEndDateChange,
    MissionStatus,
    MissionTechnology,
)
from app.modules.missions.schemas import (
    MISSION_COLORS,
    EndDateChangeRead,
    MissionContactRead,
    MissionContactUpsert,
    MissionCreate,
    MissionDetail,
    MissionSummary,
    MissionTechnologyRead,
    MissionTechnologyUpsert,
    MissionUpdate,
    RoleCreate,
    RoleRead,
    RoleUpdate,
)
from app.modules.technologies.models import Technology
from app.modules.technologies.service import TechnologyService
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import clean, normalize_text


def _invalid_dates() -> AppError:
    return AppError(ErrorCode.INVALID_DATE_RANGE, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


def check_dates(start: date, planned_end: date | None, actual_end: date | None) -> None:
    for end in (planned_end, actual_end):
        if end is not None and end < start:
            raise _invalid_dates()


def suggested_status(mission: Mission, today: date) -> MissionStatus | None:
    """Status the dates point to, when it differs from the stored one (P3-4).

    The status itself stays manual: ON_HOLD is a deliberate state and is never second-guessed,
    and a future mission may legitimately be PROSPECT or ACTIVE (signed, not started).
    """
    if mission.status == MissionStatus.ON_HOLD:
        return None
    end = mission.actual_end_date or mission.planned_end_date
    if end is not None and end < today:
        target = MissionStatus.ENDED
    elif mission.start_date <= today:
        target = MissionStatus.ACTIVE
    else:
        return None
    return target if target != mission.status else None


class MissionService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    # --- reads -----------------------------------------------------------------------------

    async def get(self, mission_id: uuid.UUID) -> Mission:
        return await get_owned(self.session, Mission, mission_id, self.user.id, "mission")

    async def summaries(self, missions: list[Mission]) -> list[MissionSummary]:
        companies = await summaries(
            self.session,
            Company,
            {m.client_id for m in missions} | {m.employer_company_id for m in missions},
        )
        today = utcnow().date()
        return [
            MissionSummary(
                id=m.id,
                title=m.title,
                job_title=m.job_title,
                client=companies[m.client_id],
                employer=companies[m.employer_company_id],
                start_date=m.start_date,
                planned_end_date=m.planned_end_date,
                actual_end_date=m.actual_end_date,
                status=m.status,
                suggested_status=suggested_status(m, today),
                color=m.color,
                archived_at=m.archived_at,
            )
            for m in missions
        ]

    async def detail(self, mission: Mission) -> MissionDetail:
        summary = (await self.summaries([mission]))[0]
        contact_rows = await self.session.execute(
            select(MissionContact, Contact, ContactRole)
            .join(Contact, Contact.id == MissionContact.contact_id)
            .outerjoin(ContactRole, ContactRole.id == MissionContact.role_id)
            .where(MissionContact.mission_id == mission.id)
            .order_by(Contact.last_name, Contact.first_name)
        )
        contact_list = list(contact_rows)
        companies = await summaries(
            self.session, Company, {c.company_id for _, c, _ in contact_list if c.company_id}
        )
        tech_rows = await self.session.execute(
            select(MissionTechnology, Technology)
            .join(Technology, Technology.id == MissionTechnology.technology_id)
            .where(MissionTechnology.mission_id == mission.id)
            .order_by(MissionTechnology.weight.desc(), Technology.normalized_name)
        )
        changes = await self.session.scalars(
            select(MissionEndDateChange)
            .where(MissionEndDateChange.mission_id == mission.id)
            .order_by(MissionEndDateChange.changed_at.desc())
        )
        return MissionDetail(
            **summary.model_dump(),
            location=mission.location,
            remote_policy=mission.remote_policy,
            objectives=mission.objectives,
            description=mission.description,
            review=mission.review,
            daily_rate=mission.daily_rate,
            contacts=[
                MissionContactRead(
                    contact=Summary(id=c.id, name=f"{c.first_name} {c.last_name}"),
                    job_title=c.job_title,
                    company=companies.get(c.company_id) if c.company_id else None,
                    role=RoleRead.model_validate(role) if role else None,
                    note=link.note,
                )
                for link, c, role in contact_list
            ],
            technologies=[
                MissionTechnologyRead(
                    technology=Summary(id=t.id, name=t.name),
                    category=t.category,
                    weight=link.weight,
                    version=link.version,
                    note=link.note,
                )
                for link, t in tech_rows
            ],
            end_date_changes=[EndDateChangeRead.model_validate(c) for c in changes],
            created_at=mission.created_at,
        )

    async def search(
        self,
        *,
        search: str | None,
        mission_status: MissionStatus | None,
        client_id: uuid.UUID | None,
        active_on: date | None,
        period_start: date | None,
        period_end: date | None,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Mission], int]:
        query = owned(select(Mission), Mission, self.user.id)
        end = func.coalesce(Mission.actual_end_date, Mission.planned_end_date)
        if search and (needle := search.strip().lower()):
            pattern = f"%{needle}%"
            client_match = select(Company.id).where(
                Company.normalized_name.like(f"%{normalize_text(search)}%")
            )
            query = query.where(
                or_(
                    func.lower(Mission.title).like(pattern),
                    func.lower(Mission.job_title).like(pattern),
                    Mission.client_id.in_(client_match),
                )
            )
        if mission_status is not None:
            query = query.where(Mission.status == mission_status)
        if client_id is not None:
            query = query.where(Mission.client_id == client_id)
        if active_on is not None:
            query = query.where(
                Mission.start_date <= active_on, or_(end.is_(None), end >= active_on)
            )
        if period_end is not None:
            query = query.where(Mission.start_date <= period_end)
        if period_start is not None:
            query = query.where(or_(end.is_(None), end >= period_start))
        if not include_archived:
            query = query.where(Mission.archived_at.is_(None))
        total = await self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = await self.session.scalars(
            query.order_by(Mission.start_date.desc(), Mission.title).limit(limit).offset(offset)
        )
        return list(rows), total

    # --- writes ----------------------------------------------------------------------------

    async def _pick_color(self) -> str:
        """Least used colour among the owner's missions, in palette order (P3-8)."""
        used = Counter(
            (
                await self.session.scalars(
                    owned(select(Mission.color), Mission, self.user.id).where(
                        Mission.archived_at.is_(None)
                    )
                )
            ).all()
        )
        return min(MISSION_COLORS, key=lambda color: used[color])

    async def create(self, data: MissionCreate) -> Mission:
        companies = CompanyService(self.session)
        await companies.get(data.client_id)
        employer_id = data.employer_company_id or self.user.employer_company_id
        if employer_id is None:
            raise AppError(
                ErrorCode.MISSION_EMPLOYER_REQUIRED,
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        await companies.get(employer_id)
        check_dates(data.start_date, data.planned_end_date, data.actual_end_date)
        mission = Mission(
            owner_id=self.user.id,
            title=data.title.strip(),
            job_title=data.job_title.strip(),
            client_id=data.client_id,
            employer_company_id=employer_id,
            start_date=data.start_date,
            planned_end_date=data.planned_end_date,
            actual_end_date=data.actual_end_date,
            status=data.status,
            location=clean(data.location),
            remote_policy=clean(data.remote_policy),
            objectives=data.objectives,
            description=data.description,
            review=data.review,
            color=data.color or await self._pick_color(),
            daily_rate=data.daily_rate,
        )
        self.session.add(mission)
        await self.session.commit()
        return mission

    async def update(self, mission_id: uuid.UUID, data: MissionUpdate) -> Mission:
        mission = await self.get(mission_id)
        fields = data.model_fields_set
        companies = CompanyService(self.session)
        if data.client_id is not None:
            await companies.get(data.client_id)
            mission.client_id = data.client_id
        if data.employer_company_id is not None:
            await companies.get(data.employer_company_id)
            mission.employer_company_id = data.employer_company_id
        for field in ("title", "job_title"):
            if (value := getattr(data, field)) is not None:
                setattr(mission, field, value.strip())
        for field in ("objectives", "description", "review", "status", "color"):
            if (value := getattr(data, field)) is not None:
                setattr(mission, field, value)
        for field in ("location", "remote_policy"):
            if field in fields:
                setattr(mission, field, clean(getattr(data, field)))
        if "daily_rate" in fields:
            mission.daily_rate = data.daily_rate

        start = data.start_date or mission.start_date
        planned = (
            data.planned_end_date if "planned_end_date" in fields else mission.planned_end_date
        )
        actual = data.actual_end_date if "actual_end_date" in fields else mission.actual_end_date
        check_dates(start, planned, actual)
        if (start, planned, actual) != (
            mission.start_date,
            mission.planned_end_date,
            mission.actual_end_date,
        ):
            # RG-02: the agenda must stay inside the mission period.
            from app.modules.agenda.service import mission_half_days_outside

            count, first = await mission_half_days_outside(
                self.session, mission, start, actual or planned
            )
            if count:
                raise AppError(
                    ErrorCode.MISSION_HAS_HALF_DAYS_OUTSIDE,
                    status_code=status.HTTP_409_CONFLICT,
                    params={"count": count, "firstDate": first.isoformat() if first else None},
                )
        if planned != mission.planned_end_date:
            self.session.add(
                MissionEndDateChange(
                    mission_id=mission.id,
                    old_date=mission.planned_end_date,
                    new_date=planned,
                    changed_at=utcnow(),
                    note=clean(data.end_date_change_note),
                )
            )
        mission.start_date, mission.planned_end_date, mission.actual_end_date = (
            start,
            planned,
            actual,
        )
        await self.session.commit()
        return mission

    async def set_archived(self, mission_id: uuid.UUID, archived: bool) -> Mission:
        mission = await self.get(mission_id)
        mission.archived_at = utcnow() if archived else None
        await self.session.commit()
        return mission

    async def delete(self, mission_id: uuid.UUID) -> None:
        """Hard delete while nothing references the mission; archive otherwise (RG-12)."""
        mission = await self.get(mission_id)
        await self.session.delete(mission)
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            raise entity_referenced("mission", "agenda") from error

    async def upsert_contact(
        self, mission_id: uuid.UUID, contact_id: uuid.UUID, data: MissionContactUpsert
    ) -> None:
        mission = await self.get(mission_id)
        await ContactService(self.session).get(contact_id)
        if data.role_id is not None:
            await RoleService(self.session).get(data.role_id)
        link = await self.session.scalar(
            select(MissionContact).where(
                MissionContact.mission_id == mission.id, MissionContact.contact_id == contact_id
            )
        )
        if link is None:
            link = MissionContact(mission_id=mission.id, contact_id=contact_id)
            self.session.add(link)
        link.role_id = data.role_id
        link.note = clean(data.note)
        await self.session.commit()

    async def remove_contact(self, mission_id: uuid.UUID, contact_id: uuid.UUID) -> None:
        mission = await self.get(mission_id)
        link = await self.session.scalar(
            select(MissionContact).where(
                MissionContact.mission_id == mission.id, MissionContact.contact_id == contact_id
            )
        )
        if link is None:
            raise not_found("missionContact")
        await self.session.delete(link)
        await self.session.commit()

    async def upsert_technology(
        self, mission_id: uuid.UUID, technology_id: uuid.UUID, data: MissionTechnologyUpsert
    ) -> None:
        mission = await self.get(mission_id)
        await TechnologyService(self.session).get(technology_id)
        link = await self.session.scalar(
            select(MissionTechnology).where(
                MissionTechnology.mission_id == mission.id,
                MissionTechnology.technology_id == technology_id,
            )
        )
        if link is None:
            link = MissionTechnology(mission_id=mission.id, technology_id=technology_id)
            self.session.add(link)
        link.weight = data.weight
        link.version = clean(data.version)
        link.note = clean(data.note)
        await self.session.commit()

    async def remove_technology(self, mission_id: uuid.UUID, technology_id: uuid.UUID) -> None:
        mission = await self.get(mission_id)
        link = await self.session.scalar(
            select(MissionTechnology).where(
                MissionTechnology.mission_id == mission.id,
                MissionTechnology.technology_id == technology_id,
            )
        )
        if link is None:
            raise not_found("missionTechnology")
        await self.session.delete(link)
        await self.session.commit()


class RoleService:
    """Contact roles: instance-wide referential (Q-D3, ADR-0032)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all_with_usage(self) -> list[tuple[ContactRole, int]]:
        usage = func.count(MissionContact.id)
        rows = await self.session.execute(
            select(ContactRole, usage)
            .outerjoin(MissionContact, MissionContact.role_id == ContactRole.id)
            .group_by(ContactRole.id)
            .order_by(ContactRole.normalized_name)
        )
        return [(role, count) for role, count in rows]

    async def get(self, role_id: uuid.UUID) -> ContactRole:
        role = await self.session.get(ContactRole, role_id)
        if role is None:
            raise not_found("contactRole")
        return role

    async def _unique(self, name_fr: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name_fr)
        query = select(ContactRole.id).where(ContactRole.normalized_name == normalized)
        if exclude is not None:
            query = query.where(ContactRole.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("contactRole")
        return normalized

    async def create(self, data: RoleCreate) -> ContactRole:
        role = ContactRole(
            name_fr=data.name_fr.strip(),
            name_en=data.name_en.strip(),
            normalized_name=await self._unique(data.name_fr),
        )
        self.session.add(role)
        await self.session.commit()
        return role

    async def update(self, role_id: uuid.UUID, data: RoleUpdate) -> ContactRole:
        role = await self.get(role_id)
        if data.name_fr is not None:
            role.name_fr = data.name_fr.strip()
            role.normalized_name = await self._unique(role.name_fr, role.id)
        if data.name_en is not None:
            role.name_en = data.name_en.strip()
        await self.session.commit()
        return role

    async def delete(self, role_id: uuid.UUID) -> None:
        role = await self.get(role_id)
        if await self.session.scalar(
            select(MissionContact.id).where(MissionContact.role_id == role.id)
        ):
            raise entity_referenced("contactRole", "missionContact")
        await self.session.delete(role)
        await self.session.commit()
