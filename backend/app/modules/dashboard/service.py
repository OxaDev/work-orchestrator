"""Mission dashboard and career view (P10, ADR-0039). Reads other modules, owns no table."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.modules.agenda import rules
from app.modules.agenda.models import HalfDay, Task, TaskStatus
from app.modules.agenda.tasks import TaskService
from app.modules.architecture.graph import subtree_depths
from app.modules.architecture.models import (
    ArchitectureDomain,
    DomainTechnology,
    MissionArchitecture,
    SubjectDomain,
)
from app.modules.architecture.service import ArchitectureService
from app.modules.auth.models import User
from app.modules.dashboard.schemas import (
    Career,
    CareerEntry,
    ContactInRole,
    MissionOverview,
    RoleGroup,
    SubjectTime,
    TechnologyShare,
    TechnologyWeight,
    TimeSpent,
)
from app.modules.directory.schemas import Summary
from app.modules.documents.service import DocumentService, summary
from app.modules.documents.wikilinks import LinkType
from app.modules.missions.models import Mission, MissionTechnology
from app.modules.missions.service import MissionService
from app.modules.subjects.models import Subject
from app.modules.technologies.models import Technology
from app.shared.ownership import owned

RECENT_TASKS = 10


def suggested_weight(minutes: int, max_minutes: int) -> int:
    """ADR-0039: 1 + round(4 x share of the busiest technology); 1 without time."""
    if max_minutes <= 0 or minutes <= 0:
        return 1
    return 1 + round(4 * minutes / max_minutes)


class DashboardService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user
        self.missions = MissionService(session, user)

    # --- time ------------------------------------------------------------------------------

    async def _time(self, mission: Mission, today: date) -> TimeSpent:
        done_half_days, planned_half_days = (
            await self.session.execute(
                owned(
                    select(
                        func.count().filter(HalfDay.date <= today),
                        func.count().filter(HalfDay.date > today),
                    ),
                    HalfDay,
                    self.user.id,
                ).where(HalfDay.mission_id == mission.id)
            )
        ).one()
        by_subject = await self._by_subject(mission)
        end = rules.mission_end(mission)
        remaining: float | None = None
        if end is not None:
            start = max(today + timedelta(days=1), mission.start_date)
            remaining = (
                len(rules.expected_slots(start, end, self.user.holiday_subdivision)) / 2
                if start <= end
                else 0.0
            )
        return TimeSpent(
            half_days_done=done_half_days,
            half_days_planned=planned_half_days,
            days_done=done_half_days / 2,
            days_planned=planned_half_days / 2,
            days_remaining=remaining,
            done_minutes=sum(row.minutes for row in by_subject),
            by_subject=by_subject,
        )

    async def _by_subject(self, mission: Mission) -> list[SubjectTime]:
        """DONE minutes grouped by top-level subject of the mission (subtree included)."""
        subjects = {
            s.id: s
            for s in await self.session.scalars(
                owned(select(Subject), Subject, self.user.id).where(
                    Subject.mission_id == mission.id
                )
            )
        }
        if not subjects:
            return []

        def root(subject_id: uuid.UUID) -> uuid.UUID:
            current = subjects[subject_id]
            while current.parent_id is not None and current.parent_id in subjects:
                current = subjects[current.parent_id]
            return current.id

        done = case((Task.status == TaskStatus.DONE, Task.duration_minutes), else_=0)
        totals: dict[uuid.UUID, list[int]] = defaultdict(lambda: [0, 0])
        for subject_id, minutes, count in await self.session.execute(
            select(
                Task.subject_id, func.sum(done), func.count().filter(Task.status == TaskStatus.DONE)
            )
            .where(Task.subject_id.in_(subjects))
            .group_by(Task.subject_id)
        ):
            bucket = totals[root(subject_id)]
            bucket[0] += int(minutes or 0)
            bucket[1] += int(count)
        rows = [
            SubjectTime(
                subject=Summary(id=subject_id, name=subjects[subject_id].title),
                minutes=minutes,
                task_count=count,
            )
            for subject_id, (minutes, count) in totals.items()
            if minutes > 0
        ]
        return sorted(rows, key=lambda r: (-r.minutes, r.subject.name.casefold()))

    # --- tasks -----------------------------------------------------------------------------

    async def _tasks(self, mission: Mission, today: date) -> tuple[list[Task], list[Task]]:
        base = (
            owned(select(Task), Task, self.user.id)
            .join(HalfDay, HalfDay.id == Task.half_day_id)
            .join(Subject, Subject.id == Task.subject_id)
            .where(Subject.mission_id == mission.id)
        )
        recent = await self.session.scalars(
            base.where(HalfDay.date < today)
            .order_by(HalfDay.date.desc(), HalfDay.period.desc(), Task.created_at.desc())
            .limit(RECENT_TASKS)
        )
        planned = await self.session.scalars(
            base.where(HalfDay.date >= today, Task.status == TaskStatus.PLANNED)
            .order_by(HalfDay.date, HalfDay.period, Task.created_at)
            .limit(RECENT_TASKS)
        )
        return list(recent), list(planned)

    # --- technologies ----------------------------------------------------------------------

    async def _technologies(self, mission: Mission) -> list[TechnologyWeight]:
        """Manual weights plus the suggestion computed from domains and time (Q-J2)."""
        done = case((Task.status == TaskStatus.DONE, Task.duration_minutes), else_=0)
        minutes: dict[uuid.UUID, int] = defaultdict(int)
        for technology_id, total in await self.session.execute(
            select(DomainTechnology.technology_id, func.sum(done))
            .join(SubjectDomain, SubjectDomain.domain_id == DomainTechnology.domain_id)
            .join(Subject, Subject.id == SubjectDomain.subject_id)
            .join(Task, Task.subject_id == Subject.id)
            .where(Subject.mission_id == mission.id, Subject.owner_id == self.user.id)
            .group_by(DomainTechnology.technology_id)
        ):
            minutes[technology_id] += int(total or 0)
        # Technologies of the domains in the mission's architectures, even without time.
        members = list(
            await self.session.scalars(
                select(ArchitectureDomain.domain_id)
                .join(
                    MissionArchitecture,
                    MissionArchitecture.architecture_id == ArchitectureDomain.architecture_id,
                )
                .where(MissionArchitecture.mission_id == mission.id)
            )
        )
        domains = await subtree_depths(self.session, members, None)
        in_architecture = set(
            await self.session.scalars(
                select(DomainTechnology.technology_id).where(
                    DomainTechnology.domain_id.in_(domains)
                )
            )
        )
        manual = {
            link.technology_id: link
            for link in await self.session.scalars(
                select(MissionTechnology).where(MissionTechnology.mission_id == mission.id)
            )
        }
        suggested_ids = {t for t, m in minutes.items() if m > 0} | in_architecture
        ids = set(manual) | suggested_ids
        technologies = {
            t.id: t
            for t in await self.session.scalars(select(Technology).where(Technology.id.in_(ids)))
        }
        busiest = max(minutes.values(), default=0)
        rows = [
            TechnologyWeight(
                technology=Summary(id=t, name=technologies[t].name),
                category=technologies[t].category,
                weight=manual[t].weight if t in manual else None,
                version=manual[t].version if t in manual else None,
                suggested_weight=suggested_weight(minutes.get(t, 0), busiest)
                if t in suggested_ids
                else None,
                minutes=minutes.get(t, 0),
            )
            for t in ids
        ]
        return sorted(
            rows,
            key=lambda r: (
                -(r.weight or 0),
                -(r.suggested_weight or 0),
                r.technology.name.casefold(),
            ),
        )

    # --- overview --------------------------------------------------------------------------

    async def overview(self, mission_id: uuid.UUID) -> MissionOverview:
        mission = await self.missions.get(mission_id)
        today = utcnow().date()
        detail = await self.missions.detail(mission)
        groups: dict[uuid.UUID | None, RoleGroup] = {}
        for link in detail.contacts:
            key = link.role.id if link.role else None
            group = groups.setdefault(key, RoleGroup(role=link.role, contacts=[]))
            group.contacts.append(ContactInRole(contact=link.contact, job_title=link.job_title))
        recent, planned = await self._tasks(mission, today)
        tasks = TaskService(self.session, self.user)
        architectures = ArchitectureService(self.session, self.user)
        documents = DocumentService(self.session, self.user)
        return MissionOverview(
            mission=(await self.missions.summaries([mission]))[0],
            time=await self._time(mission, today),
            recent_tasks=await tasks.reads(recent),
            planned_tasks=await tasks.reads(planned),
            technologies=await self._technologies(mission),
            # Named roles first, alphabetically; contacts without a role last.
            contacts_by_role=sorted(
                groups.values(),
                key=lambda g: (g.role is None, (g.role.name_fr if g.role else "").casefold()),
            ),
            architectures=await architectures.summaries(
                await architectures.search(
                    company_id=None, mission_id=mission.id, search=None, include_archived=False
                )
            ),
            documents=[
                summary(d)
                for d in await documents.search(
                    search=None, entity=(LinkType.MISSION, mission.id), include_archived=False
                )
            ],
            backlinks=await documents.backlinks(LinkType.MISSION, mission.id),
        )

    async def career(self) -> Career:
        """Every mission, archived included, oldest first, with days and main technologies."""
        missions = list(
            await self.session.scalars(
                owned(select(Mission), Mission, self.user.id).order_by(Mission.start_date)
            )
        )
        ids = [m.id for m in missions]
        days = {
            mission_id: count / 2
            for mission_id, count in await self.session.execute(
                owned(select(HalfDay.mission_id, func.count()), HalfDay, self.user.id)
                .where(HalfDay.mission_id.in_(ids))
                .group_by(HalfDay.mission_id)
            )
        }
        technologies: dict[uuid.UUID, list[TechnologyShare]] = defaultdict(list)
        for mission_id, weight, technology in await self.session.execute(
            select(MissionTechnology.mission_id, MissionTechnology.weight, Technology)
            .join(Technology, Technology.id == MissionTechnology.technology_id)
            .where(MissionTechnology.mission_id.in_(ids))
            .order_by(MissionTechnology.weight.desc(), Technology.normalized_name)
        ):
            if len(technologies[mission_id]) < 5:
                technologies[mission_id].append(
                    TechnologyShare(
                        technology=Summary(id=technology.id, name=technology.name), weight=weight
                    )
                )
        summaries = await self.missions.summaries(missions)
        return Career(
            missions=[
                CareerEntry(mission=s, days=days.get(s.id, 0.0), technologies=technologies[s.id])
                for s in summaries
            ]
        )
