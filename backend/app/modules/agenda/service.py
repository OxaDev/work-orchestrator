"""Agenda use cases (P4): half-days, public holidays, statistics, monthly locks, subtypes."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from fastapi import status
from sqlalchemy import delete, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import AppError, ErrorCode
from app.modules.agenda import compatibility, rules
from app.modules.agenda.models import (
    HalfDay,
    HalfDayKind,
    HalfDaySubtype,
    HolidayGeneration,
    LockAction,
    MonthLock,
    MonthLockEvent,
    Period,
    Task,
    WeekTemplateSlot,
    WorkLocation,
)
from app.modules.agenda.schemas import (
    HalfDayRead,
    HalfDayValues,
    HolidayGenerationResult,
    KindDays,
    LocationDays,
    LockEventRead,
    MissionDays,
    MonthStatus,
    MonthSummary,
    Slot,
    Stats,
    SubtypeCreate,
    SubtypeUpdate,
    Unfilled,
)
from app.modules.auth.models import User
from app.modules.directory.schemas import Summary
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import clean, normalize_text


def _slot_key(day: date, period: Period) -> tuple[date, Period]:
    return day, Period(period)


class LockService:
    """Monthly locks (ADR-0021). `ensure_unlocked` guards every agenda write."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def locked_months(self, months: set[tuple[int, int]]) -> set[tuple[int, int]]:
        if not months:
            return set()
        rows = await self.session.execute(
            owned(select(MonthLock.year, MonthLock.month), MonthLock, self.user.id).where(
                tuple_(MonthLock.year, MonthLock.month).in_(list(months))
            )
        )
        return {(year, month) for year, month in rows}

    async def ensure_unlocked(self, dates: set[date]) -> None:
        locked = await self.locked_months(rules.months_of(dates))
        if locked:
            raise AppError(
                ErrorCode.MONTH_LOCKED,
                status_code=status.HTTP_409_CONFLICT,
                params={"months": [f"{y:04d}-{m:02d}" for y, m in sorted(locked)]},
            )

    async def year_summary(self, year: int) -> list[MonthSummary]:
        locks = {
            lock.month: lock
            for lock in await self.session.scalars(
                owned(select(MonthLock), MonthLock, self.user.id).where(MonthLock.year == year)
            )
        }
        return [
            MonthSummary(
                year=year,
                month=month,
                locked=month in locks,
                locked_at=locks[month].locked_at if month in locks else None,
            )
            for month in range(1, 13)
        ]

    async def _lock(self, year: int, month: int) -> MonthLock | None:
        lock: MonthLock | None = await self.session.scalar(
            owned(select(MonthLock), MonthLock, self.user.id).where(
                MonthLock.year == year, MonthLock.month == month
            )
        )
        return lock

    async def status(self, year: int, month: int) -> MonthStatus:
        start, end = rules.month_bounds(year, month)
        lock = await self._lock(year, month)
        missing = await HalfDayService(self.session, self.user).missing_slots(start, end)
        events = await self.session.scalars(
            owned(select(MonthLockEvent), MonthLockEvent, self.user.id)
            .where(MonthLockEvent.year == year, MonthLockEvent.month == month)
            .order_by(MonthLockEvent.at.desc())
        )
        return MonthStatus(
            year=year,
            month=month,
            locked=lock is not None,
            locked_at=lock.locked_at if lock else None,
            note=lock.note if lock else None,
            missing=missing,
            stats=await StatsService(self.session, self.user).compute(start, end),
            events=[LockEventRead.model_validate(e) for e in events],
        )

    async def lock(self, year: int, month: int, note: str | None) -> MonthStatus:
        if await self._lock(year, month) is None:
            start, end = rules.month_bounds(year, month)
            missing = await HalfDayService(self.session, self.user).missing_slots(start, end)
            if missing:
                raise AppError(
                    ErrorCode.MONTH_INCOMPLETE,
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    params={
                        "count": len(missing),
                        "missing": [m.model_dump(mode="json") for m in missing[:20]],
                    },
                )
            now = utcnow()
            self.session.add(
                MonthLock(
                    owner_id=self.user.id, year=year, month=month, locked_at=now, note=clean(note)
                )
            )
            self.session.add(
                MonthLockEvent(
                    owner_id=self.user.id,
                    year=year,
                    month=month,
                    action=LockAction.LOCK,
                    reason=clean(note),
                    at=now,
                )
            )
            await self.session.commit()
        return await self.status(year, month)

    async def unlock(self, year: int, month: int, reason: str) -> MonthStatus:
        lock = await self._lock(year, month)
        if lock is None:
            raise AppError(ErrorCode.MONTH_NOT_LOCKED, status_code=status.HTTP_409_CONFLICT)
        await self.session.delete(lock)
        self.session.add(
            MonthLockEvent(
                owner_id=self.user.id,
                year=year,
                month=month,
                action=LockAction.UNLOCK,
                reason=reason.strip(),
                at=utcnow(),
            )
        )
        await self.session.commit()
        return await self.status(year, month)


class HalfDayService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user
        self.locks = LockService(session, user)

    async def between(self, start: date, end: date) -> list[HalfDay]:
        rules.check_range(start, end)
        rows = await self.session.scalars(
            owned(select(HalfDay), HalfDay, self.user.id)
            .where(HalfDay.date >= start, HalfDay.date <= end)
            .order_by(HalfDay.date, HalfDay.period)
        )
        return list(rows)

    async def _existing(self, keys: set[tuple[date, Period]]) -> dict[tuple[date, Period], HalfDay]:
        if not keys:
            return {}
        rows = await self.session.scalars(
            owned(select(HalfDay), HalfDay, self.user.id).where(
                tuple_(HalfDay.date, HalfDay.period).in_([(d, p.value) for d, p in keys])
            )
        )
        return {_slot_key(row.date, row.period): row for row in rows}

    async def write(self, entries: list[tuple[Slot, HalfDayValues]]) -> list[HalfDay]:
        """Shared bulk write path (ADR-0033, ADR-0035): creates or replaces half-days, each with
        its own values, after the lock guard, RG-02, subtype and task checks. Does not commit.
        """
        wanted = {_slot_key(slot.date, slot.period): values for slot, values in entries}
        await self.locks.ensure_unlocked({d for d, _ in wanted})
        groups: dict[str, list[tuple[date, Period]]] = defaultdict(list)
        group_values: dict[str, HalfDayValues] = {}
        for key, values in wanted.items():
            signature = values.model_dump_json()
            groups[signature].append(key)
            group_values[signature] = values
        existing = await self._existing(set(wanted))
        for signature, keys in groups.items():
            values = group_values[signature]
            mission = (
                await get_owned(self.session, Mission, values.mission_id, self.user.id, "mission")
                if values.mission_id
                else None
            )
            subtype = (
                await SubtypeService(self.session).get(values.subtype_id)
                if values.subtype_id
                else None
            )
            rules.validate_values(
                values.kind, mission, subtype, values.location, {d for d, _ in keys}
            )
            await self._ensure_tasks_compatible(
                [existing[key] for key in keys if key in existing], values
            )

        result: list[HalfDay] = []
        for day, period in sorted(wanted):
            values = wanted[(day, period)]
            row = existing.get((day, period))
            if row is None:
                row = HalfDay(owner_id=self.user.id, date=day, period=period)
                self.session.add(row)
            row.kind = values.kind
            row.subtype_id = values.subtype_id
            row.mission_id = values.mission_id
            row.location = values.location
            row.note = clean(values.note)
            result.append(row)
        return result

    async def assign(self, slots: list[Slot], values: HalfDayValues) -> list[HalfDay]:
        """Creates or replaces the given half-days with the same values, all or nothing."""
        result = await self.write([(slot, values) for slot in slots])
        await self.session.commit()
        return result

    async def _ensure_tasks_compatible(self, rows: list[HalfDay], values: HalfDayValues) -> None:
        """ADR-0020: a half-day cannot change to a nature its tasks are not allowed in."""
        if not rows:
            return
        by_id = {row.id: row for row in rows}
        conflicts = [
            {
                "id": str(task.id),
                "title": task.title,
                "date": by_id[task.half_day_id].date.isoformat(),
                "period": by_id[task.half_day_id].period.value,
            }
            for task, subject in await self.session.execute(
                select(Task, Subject)
                .join(Subject, Subject.id == Task.subject_id)
                .where(Task.half_day_id.in_(by_id))
                .order_by(Task.created_at)
            )
            if not compatibility.is_compatible(
                values.kind, values.mission_id, subject.scope, subject.mission_id
            )
        ]
        if conflicts:
            raise AppError(
                ErrorCode.HALF_DAY_HAS_INCOMPATIBLE_TASKS,
                status_code=status.HTTP_409_CONFLICT,
                params={"count": len(conflicts), "tasks": conflicts[:20]},
            )

    async def clear(self, slots: list[Slot]) -> int:
        keys = {_slot_key(s.date, s.period) for s in slots}
        await self.locks.ensure_unlocked({d for d, _ in keys})
        task_count = await self.session.scalar(
            owned(select(func.count(Task.id)), Task, self.user.id)
            .join(HalfDay, HalfDay.id == Task.half_day_id)
            .where(tuple_(HalfDay.date, HalfDay.period).in_([(d, p.value) for d, p in keys]))
        )
        if task_count:
            raise AppError(
                ErrorCode.HALF_DAY_HAS_TASKS,
                status_code=status.HTTP_409_CONFLICT,
                params={"count": task_count},
            )
        result = await self.session.execute(
            delete(HalfDay).where(
                HalfDay.owner_id == self.user.id,
                tuple_(HalfDay.date, HalfDay.period).in_([(d, p.value) for d, p in keys]),
            )
        )
        await self.session.commit()
        return int(result.rowcount)  # type: ignore[attr-defined]

    async def missing_slots(self, start: date, end: date) -> list[Slot]:
        """Expected weekday half-days (not public holidays) with nothing recorded."""
        expected = rules.expected_slots(start, end, self.user.holiday_subdivision)
        if not expected:
            return []
        filled = {
            _slot_key(row.date, row.period)
            for row in await self.session.scalars(
                owned(select(HalfDay), HalfDay, self.user.id).where(
                    HalfDay.date >= start, HalfDay.date <= end
                )
            )
        }
        return [Slot(date=d, period=p) for d, p in expected if (d, p) not in filled]

    async def unfilled(self) -> Unfilled:
        """Past half-days left empty since the user started using the agenda (P4-11)."""
        until = utcnow().date() - timedelta(days=1)
        first = await self.session.scalar(
            owned(select(func.min(HalfDay.date)), HalfDay, self.user.id)
        )
        start = min(first or self.user.created_at.date(), self.user.created_at.date())
        since = max(start.replace(day=1), until - timedelta(days=rules.MAX_RANGE_DAYS - 1))
        missing = await self.missing_slots(since, until) if since <= until else []
        return Unfilled(count=len(missing), since=since, until=until, slots=missing[:31])


class HolidayService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    def for_year(self, year: int) -> dict[date, str]:
        return rules.public_holidays(year, self.user.holiday_subdivision)

    async def generate(self, year: int, force: bool) -> HolidayGenerationResult:
        """Pre-fills public holidays once per year (RG-11); `force` re-runs a done year."""
        done = await self.session.scalar(
            owned(select(HolidayGeneration), HolidayGeneration, self.user.id).where(
                HolidayGeneration.year == year
            )
        )
        if done is not None and not force:
            return HolidayGenerationResult(created=0, skipped_locked=0, already_generated=True)

        holidays = self.for_year(year)
        locked = await LockService(self.session, self.user).locked_months(rules.months_of(holidays))
        existing = await HalfDayService(self.session, self.user)._existing(
            {(d, p) for d in holidays for p in Period}
        )
        created = skipped = 0
        for day, name in sorted(holidays.items()):
            for period in Period:
                if (day.year, day.month) in locked:
                    skipped += 1
                elif (day, period) not in existing:
                    self.session.add(
                        HalfDay(
                            owner_id=self.user.id,
                            date=day,
                            period=period,
                            kind=HalfDayKind.PUBLIC_HOLIDAY,
                            note=name,
                        )
                    )
                    created += 1
        if done is None:
            self.session.add(
                HolidayGeneration(owner_id=self.user.id, year=year, generated_at=utcnow())
            )
        else:
            done.generated_at = utcnow()
        await self.session.commit()
        return HolidayGenerationResult(
            created=created, skipped_locked=skipped, already_generated=False
        )


class StatsService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def compute(self, start: date, end: date) -> Stats:
        rows = await HalfDayService(self.session, self.user).between(start, end)
        by_kind: dict[HalfDayKind, int] = defaultdict(int)
        by_mission: dict[uuid.UUID, int] = defaultdict(int)
        by_location: dict[WorkLocation, int] = defaultdict(int)
        for row in rows:
            by_kind[row.kind] += 1
            if row.mission_id:
                by_mission[row.mission_id] += 1
            if row.location:
                by_location[row.location] += 1
        missions = {
            m.id: m
            for m in await self.session.scalars(select(Mission).where(Mission.id.in_(by_mission)))
        }
        expected = rules.expected_slots(start, end, self.user.holiday_subdivision)
        missing = await HalfDayService(self.session, self.user).missing_slots(start, end)
        return Stats(
            period_start=start,
            period_end=end,
            working_days=len(expected) / 2,
            filled_days=len(rows) / 2,
            by_kind=[KindDays(kind=k, days=n / 2) for k, n in sorted(by_kind.items())],
            by_mission=[
                MissionDays(
                    mission=Summary(id=mid, name=missions[mid].title),
                    color=missions[mid].color,
                    days=n / 2,
                )
                for mid, n in sorted(by_mission.items(), key=lambda item: -item[1])
            ],
            by_location=[
                LocationDays(location=loc, days=n / 2) for loc, n in sorted(by_location.items())
            ],
            unfilled_count=len(missing),
        )


class SubtypeService:
    """Editable subtypes of half-day kinds (ADR-0018). Instance-wide referential."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all_with_usage(self) -> list[tuple[HalfDaySubtype, int]]:
        usage = func.count(HalfDay.id)
        rows = await self.session.execute(
            select(HalfDaySubtype, usage)
            .outerjoin(HalfDay, HalfDay.subtype_id == HalfDaySubtype.id)
            .group_by(HalfDaySubtype.id)
            .order_by(HalfDaySubtype.kind, HalfDaySubtype.normalized_name)
        )
        return [(subtype, count) for subtype, count in rows]

    async def get(self, subtype_id: uuid.UUID) -> HalfDaySubtype:
        subtype = await self.session.get(HalfDaySubtype, subtype_id)
        if subtype is None:
            raise not_found("halfDaySubtype")
        return subtype

    async def _unique(
        self, kind: HalfDayKind, name_fr: str, exclude: uuid.UUID | None = None
    ) -> str:
        normalized = normalize_text(name_fr)
        query = select(HalfDaySubtype.id).where(
            HalfDaySubtype.kind == kind, HalfDaySubtype.normalized_name == normalized
        )
        if exclude is not None:
            query = query.where(HalfDaySubtype.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("halfDaySubtype")
        return normalized

    async def create(self, data: SubtypeCreate) -> HalfDaySubtype:
        subtype = HalfDaySubtype(
            kind=data.kind,
            name_fr=data.name_fr.strip(),
            name_en=data.name_en.strip(),
            normalized_name=await self._unique(data.kind, data.name_fr),
        )
        self.session.add(subtype)
        await self.session.commit()
        return subtype

    async def update(self, subtype_id: uuid.UUID, data: SubtypeUpdate) -> HalfDaySubtype:
        subtype = await self.get(subtype_id)
        if data.name_fr is not None:
            subtype.name_fr = data.name_fr.strip()
            subtype.normalized_name = await self._unique(subtype.kind, subtype.name_fr, subtype.id)
        if data.name_en is not None:
            subtype.name_en = data.name_en.strip()
        await self.session.commit()
        return subtype

    async def delete(self, subtype_id: uuid.UUID) -> None:
        subtype = await self.get(subtype_id)
        if await self.session.scalar(
            select(HalfDay.id).where(HalfDay.subtype_id == subtype.id).limit(1)
        ):
            raise entity_referenced("halfDaySubtype", "halfDay")
        if await self.session.scalar(
            select(WeekTemplateSlot.id).where(WeekTemplateSlot.subtype_id == subtype.id).limit(1)
        ):
            raise entity_referenced("halfDaySubtype", "weekTemplate")
        await self.session.delete(subtype)
        await self.session.commit()


def half_day_reads(rows: list[HalfDay]) -> list[HalfDayRead]:
    return [HalfDayRead.model_validate(row) for row in rows]


async def mission_half_days_outside(
    session: AsyncSession, mission: Mission, start: date, end: date | None
) -> tuple[int, date | None]:
    """Half-days of `mission` falling outside [start, end] (used before changing mission dates)."""
    conditions = [HalfDay.date < start]
    if end is not None:
        conditions.append(HalfDay.date > end)
    row = (
        await session.execute(
            select(func.count(), func.min(HalfDay.date)).where(
                HalfDay.mission_id == mission.id, or_(*conditions)
            )
        )
    ).one()
    return int(row[0]), row[1]
