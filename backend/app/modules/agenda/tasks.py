"""Agenda micro (P5): tasks, carry over, daily logs and standup (ADR-0020, ADR-0021, ADR-0034)."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from fastapi import status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.modules.agenda import compatibility, rules
from app.modules.agenda.models import (
    COUNTED_STATUSES,
    DailyLog,
    HalfDay,
    Period,
    Task,
    TaskKind,
    TaskParticipant,
    TaskStatus,
)
from app.modules.agenda.schemas import (
    AgendaWarning,
    CarryOverRequest,
    DailyLogRead,
    DailyLogWrite,
    Standup,
    SubjectRef,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    WarningCode,
)
from app.modules.agenda.service import LockService
from app.modules.architecture.models import Domain, SubjectDomain
from app.modules.auth.models import User
from app.modules.directory.models import Contact
from app.modules.directory.schemas import Summary
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.shared.ownership import get_owned, owned
from app.shared.schemas import not_found

HALF_DAY_MINUTES = 240  # RG-06: above this, a half-day is overbooked (warning only)
CARRY_OVER_HORIZON_DAYS = 31
STANDUP_LOOKBACK_DAYS = 14


def _conflict(code: ErrorCode, **params: object) -> AppError:
    return AppError(code, status_code=status.HTTP_409_CONFLICT, params=params)


def _in_mission(mission: Mission, day: date) -> bool:
    end = rules.mission_end(mission)
    return mission.start_date <= day and (end is None or day <= end)


class TaskService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user
        self.locks = LockService(session, user)

    # --- reads -----------------------------------------------------------------------------

    async def get(self, task_id: uuid.UUID) -> Task:
        return await get_owned(self.session, Task, task_id, self.user.id, "task")

    async def between(
        self, start: date, end: date, subject_id: uuid.UUID | None = None
    ) -> list[Task]:
        rules.check_range(start, end)
        query = (
            owned(select(Task), Task, self.user.id)
            .join(HalfDay, HalfDay.id == Task.half_day_id)
            .where(HalfDay.date >= start, HalfDay.date <= end)
        )
        if subject_id is not None:
            query = query.where(Task.subject_id == subject_id)
        rows = await self.session.scalars(
            query.order_by(
                HalfDay.date, HalfDay.period, Task.starts_at.asc().nulls_last(), Task.created_at
            )
        )
        return list(rows)

    async def reads(self, tasks: list[Task]) -> list[TaskRead]:
        if not tasks:
            return []
        half_days = {
            h.id: h
            for h in await self.session.scalars(
                select(HalfDay).where(HalfDay.id.in_({t.half_day_id for t in tasks}))
            )
        }
        subjects = {
            s.id: s
            for s in await self.session.scalars(
                select(Subject).where(Subject.id.in_({t.subject_id for t in tasks}))
            )
        }
        participants: dict[uuid.UUID, list[Summary]] = defaultdict(list)
        for task_id, contact in await self.session.execute(
            select(TaskParticipant.task_id, Contact)
            .join(Contact, Contact.id == TaskParticipant.contact_id)
            .where(TaskParticipant.task_id.in_([t.id for t in tasks]))
            .order_by(Contact.last_name, Contact.first_name)
        ):
            participants[task_id].append(
                Summary(id=contact.id, name=f"{contact.first_name} {contact.last_name}")
            )
        domains: dict[uuid.UUID, list[Summary]] = defaultdict(list)
        for subject_id, domain_id, name in await self.session.execute(
            select(SubjectDomain.subject_id, Domain.id, Domain.name)
            .join(Domain, Domain.id == SubjectDomain.domain_id)
            .where(SubjectDomain.subject_id.in_(subjects))
            .order_by(Domain.normalized_name)
        ):
            domains[subject_id].append(Summary(id=domain_id, name=name))
        result = []
        for task in tasks:
            half_day, subject = half_days[task.half_day_id], subjects[task.subject_id]
            result.append(
                TaskRead(
                    id=task.id,
                    date=half_day.date,
                    period=half_day.period,
                    subject=SubjectRef(
                        id=subject.id,
                        title=subject.title,
                        scope=subject.scope,
                        mission_id=subject.mission_id,
                    ),
                    kind=task.kind,
                    title=task.title,
                    starts_at=task.starts_at,
                    duration_minutes=task.duration_minutes,
                    status=task.status,
                    description=task.description,
                    external_ref=task.external_ref,
                    participants=participants[task.id],
                    carried_from_id=task.carried_from_id,
                    domains=domains[task.subject_id],
                )
            )
        return result

    async def read(self, task: Task) -> TaskRead:
        return (await self.reads([task]))[0]

    async def warnings(self, half_day_id: uuid.UUID) -> list[AgendaWarning]:
        """RG-06: more than 4 h of planned or done work in a half-day is only a warning."""
        total = await self.session.scalar(
            select(func.coalesce(func.sum(Task.duration_minutes), 0)).where(
                Task.half_day_id == half_day_id, Task.status.in_(COUNTED_STATUSES)
            )
        )
        if (total or 0) <= HALF_DAY_MINUTES:
            return []
        half_day = await self.session.get(HalfDay, half_day_id)
        assert half_day is not None  # noqa: S101 - the task we just wrote references it
        return [
            AgendaWarning(
                code=WarningCode.HALF_DAY_OVERBOOKED,
                params={
                    "date": half_day.date.isoformat(),
                    "period": half_day.period.value,
                    "totalMinutes": int(total or 0),
                    "maxMinutes": HALF_DAY_MINUTES,
                },
            )
        ]

    # --- placement -------------------------------------------------------------------------

    async def _subject(self, subject_id: uuid.UUID) -> Subject:
        subject = await get_owned(self.session, Subject, subject_id, self.user.id, "subject")
        if subject.archived_at is not None:
            raise AppError(
                ErrorCode.SUBJECT_ARCHIVED, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
            )
        return subject

    async def _half_day(self, day: date, period: Period) -> HalfDay | None:
        half_day: HalfDay | None = await self.session.scalar(
            owned(select(HalfDay), HalfDay, self.user.id).where(
                HalfDay.date == day, HalfDay.period == period
            )
        )
        return half_day

    async def _mission(self, subject: Subject) -> Mission | None:
        return await self.session.get(Mission, subject.mission_id) if subject.mission_id else None

    async def _fill(self, day: date, period: Period, subject: Subject) -> HalfDay:
        """Fills an empty slot with the subject's natural kind (ADR-0034)."""
        kind = compatibility.NATURAL_KIND[subject.scope]
        if kind is None:
            raise AppError(
                ErrorCode.HALF_DAY_EMPTY,
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                params={"date": day.isoformat(), "period": period.value},
            )
        mission = await self._mission(subject)
        rules.validate_values(kind, mission, None, None, {day})  # RG-02
        half_day = HalfDay(
            owner_id=self.user.id, date=day, period=period, kind=kind, mission_id=subject.mission_id
        )
        self.session.add(half_day)
        await self.session.flush()
        return half_day

    async def _place(self, day: date, period: Period, subject: Subject) -> HalfDay:
        half_day = await self._half_day(day, period)
        if half_day is None:
            return await self._fill(day, period, subject)
        compatibility.check(half_day.kind, half_day.mission_id, subject.scope, subject.mission_id)
        return half_day

    async def _check_participants(self, kind: TaskKind, ids: list[uuid.UUID]) -> set[uuid.UUID]:
        unique = set(ids)
        if unique and kind != TaskKind.MEETING:
            raise AppError(
                ErrorCode.TASK_PARTICIPANTS_MEETING_ONLY,
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        found = set(await self.session.scalars(select(Contact.id).where(Contact.id.in_(unique))))
        if found != unique:
            raise not_found("contact")
        return unique

    async def _set_participants(self, task: Task, ids: set[uuid.UUID]) -> None:
        await self.session.execute(
            delete(TaskParticipant).where(TaskParticipant.task_id == task.id)
        )
        self.session.add_all(TaskParticipant(task_id=task.id, contact_id=c) for c in ids)

    # --- writes ----------------------------------------------------------------------------

    async def create(self, data: TaskCreate) -> Task:
        await self.locks.ensure_unlocked({data.date})  # RG-13
        subject = await self._subject(data.subject_id)
        participants = await self._check_participants(data.kind, data.participant_ids)
        half_day = await self._place(data.date, data.period, subject)
        task = Task(
            owner_id=self.user.id,
            half_day_id=half_day.id,
            subject_id=subject.id,
            kind=data.kind,
            title=data.title.strip(),
            starts_at=data.starts_at,
            duration_minutes=data.duration_minutes,
            status=data.status,
            description=data.description,
            external_ref=(data.external_ref or "").strip() or None,
        )
        self.session.add(task)
        await self.session.flush()
        await self._set_participants(task, participants)
        await self.session.commit()
        return task

    async def _changes_time_accounting(
        self, task: Task, half_day: HalfDay, data: TaskUpdate
    ) -> bool:
        """True when the update changes anything but the description."""
        fields = data.model_fields_set
        # Non-nullable fields: an explicit null means "unchanged".
        required = {
            "date": half_day.date,
            "period": half_day.period,
            "subject_id": task.subject_id,
            "kind": task.kind,
            "title": task.title,
            "duration_minutes": task.duration_minutes,
            "status": task.status,
        }
        title = data.title.strip() if data.title is not None else None
        for name, value in required.items():
            new = title if name == "title" else getattr(data, name)
            if name in fields and new is not None and new != value:
                return True
        if "starts_at" in fields and data.starts_at != task.starts_at:
            return True
        external_ref = (data.external_ref or "").strip() or None
        if "external_ref" in fields and external_ref != task.external_ref:
            return True
        if "participant_ids" in fields:
            existing = set(
                await self.session.scalars(
                    select(TaskParticipant.contact_id).where(TaskParticipant.task_id == task.id)
                )
            )
            return set(data.participant_ids or []) != existing
        return False

    async def update(self, task_id: uuid.UUID, data: TaskUpdate) -> Task:
        task = await self.get(task_id)
        half_day = await self.session.get(HalfDay, task.half_day_id)
        assert half_day is not None  # noqa: S101 - FK
        fields = data.model_fields_set
        target_day = data.date or half_day.date
        target_period = data.period or half_day.period
        # ADR-0021: in a locked month only the description (notes) stays editable. Values are
        # compared, not fields: an edit form sends every field back unchanged.
        if await self._changes_time_accounting(task, half_day, data):
            await self.locks.ensure_unlocked({half_day.date, target_day})

        moved = (target_day, target_period) != (half_day.date, half_day.period)
        if data.subject_id is not None and data.subject_id != task.subject_id:
            subject = await self._subject(data.subject_id)
        else:
            subject = await get_owned(
                self.session, Subject, task.subject_id, self.user.id, "subject"
            )
        if moved or subject.id != task.subject_id:
            target = await self._place(target_day, target_period, subject)
            task.half_day_id = target.id
            task.subject_id = subject.id

        kind = data.kind or task.kind
        if "participant_ids" in fields:
            await self._set_participants(
                task, await self._check_participants(kind, data.participant_ids or [])
            )
        elif kind != TaskKind.MEETING:
            await self._set_participants(task, set())
        task.kind = kind
        if data.title is not None:
            task.title = data.title.strip()
        if "starts_at" in fields:
            task.starts_at = data.starts_at
        if data.duration_minutes is not None:
            task.duration_minutes = data.duration_minutes
        if data.status is not None:
            task.status = data.status
        if data.description is not None:
            task.description = data.description
        if "external_ref" in fields:
            task.external_ref = (data.external_ref or "").strip() or None
        await self.session.commit()
        return task

    async def delete(self, task_id: uuid.UUID) -> None:
        task = await self.get(task_id)
        half_day = await self.session.get(HalfDay, task.half_day_id)
        assert half_day is not None  # noqa: S101 - FK
        await self.locks.ensure_unlocked({half_day.date})
        await self.session.delete(task)
        await self.session.commit()

    async def _next_half_day(
        self, after: HalfDay, subject: Subject, not_before: date | None
    ) -> HalfDay:
        """First later slot holding a compatible half-day, or empty and fillable (ADR-0034)."""
        start = max(after.date, not_before or after.date)
        end = start + timedelta(days=CARRY_OVER_HORIZON_DAYS)
        existing = {
            (h.date, h.period): h
            for h in await self.session.scalars(
                owned(select(HalfDay), HalfDay, self.user.id).where(
                    HalfDay.date >= start, HalfDay.date <= end
                )
            )
        }
        holidays = rules.holidays_between(start, end, self.user.holiday_subdivision)
        locked = await self.locks.locked_months(rules.months_of(rules.days(start, end)))
        mission = await self._mission(subject)
        natural = compatibility.NATURAL_KIND[subject.scope]
        for day in rules.days(start, end):
            if (day.year, day.month) in locked:
                continue
            for period in Period:
                if (day, period) <= (after.date, after.period):
                    continue
                if (half_day := existing.get((day, period))) is not None:
                    if compatibility.is_compatible(
                        half_day.kind, half_day.mission_id, subject.scope, subject.mission_id
                    ):
                        return half_day
                elif (
                    natural is not None
                    and rules.is_weekday(day)
                    and day not in holidays
                    and (mission is None or _in_mission(mission, day))
                ):
                    return await self._fill(day, period, subject)
        raise _conflict(ErrorCode.NO_COMPATIBLE_HALF_DAY, days=CARRY_OVER_HORIZON_DAYS)

    async def carry_over(self, task_id: uuid.UUID, data: CarryOverRequest) -> Task:
        """Copies a planned task to a later half-day; the original becomes CARRIED_OVER (P5-7)."""
        task = await self.get(task_id)
        if task.status != TaskStatus.PLANNED:
            raise _conflict(ErrorCode.TASK_NOT_PLANNED)
        source = await self.session.get(HalfDay, task.half_day_id)
        assert source is not None  # noqa: S101 - FK
        await self.locks.ensure_unlocked({source.date})
        subject = await self._subject(task.subject_id)
        if data.target is not None:
            await self.locks.ensure_unlocked({data.target.date})
            target = await self._place(data.target.date, data.target.period, subject)
        else:
            target = await self._next_half_day(source, subject, data.not_before)
        copy = Task(
            owner_id=self.user.id,
            half_day_id=target.id,
            subject_id=subject.id,
            kind=task.kind,
            title=task.title,
            # The original time belonged to the original half-day.
            starts_at=None,
            duration_minutes=task.duration_minutes,
            status=TaskStatus.PLANNED,
            description=task.description,
            external_ref=task.external_ref,
            carried_from_id=task.id,
        )
        self.session.add(copy)
        await self.session.flush()
        contacts = set(
            await self.session.scalars(
                select(TaskParticipant.contact_id).where(TaskParticipant.task_id == task.id)
            )
        )
        await self._set_participants(copy, contacts)
        task.status = TaskStatus.CARRIED_OVER
        await self.session.commit()
        return copy


class DailyLogService:
    """Daily notes (Q-G1): editable even in locked months (ADR-0021)."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def _row(self, day: date) -> DailyLog | None:
        row: DailyLog | None = await self.session.scalar(
            owned(select(DailyLog), DailyLog, self.user.id).where(DailyLog.date == day)
        )
        return row

    async def get(self, day: date) -> DailyLogRead:
        row = await self._row(day)
        if row is None:
            return DailyLogRead(date=day, done="", planned="", blockers="", updated_at=None)
        return DailyLogRead(
            date=row.date,
            done=row.done,
            planned=row.planned,
            blockers=row.blockers,
            updated_at=row.updated_at,
        )

    async def put(self, day: date, data: DailyLogWrite) -> DailyLogRead:
        row = await self._row(day)
        if row is None:
            row = DailyLog(owner_id=self.user.id, date=day)
            self.session.add(row)
        row.done, row.planned, row.blockers = data.done, data.planned, data.blockers
        await self.session.commit()
        await self.session.refresh(row)
        return await self.get(day)


class StandupService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def build(self, day: date) -> Standup:
        """Structured standup data; the client writes the localized text (ADR-0013, P5-9)."""
        previous_date = await self.session.scalar(
            owned(select(func.max(HalfDay.date)), HalfDay, self.user.id)
            .join(Task, Task.half_day_id == HalfDay.id)
            .where(HalfDay.date < day, HalfDay.date >= day - timedelta(days=STANDUP_LOOKBACK_DAYS))
        )
        tasks = TaskService(self.session, self.user)
        previous = await tasks.between(previous_date, previous_date) if previous_date else []
        return Standup(
            day=day,
            previous_day=previous_date,
            previous=await tasks.reads(previous),
            today=await tasks.reads(await tasks.between(day, day)),
            log=await DailyLogService(self.session, self.user).get(day),
        )
