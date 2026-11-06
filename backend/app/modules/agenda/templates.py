"""Week templates (P6, ADR-0035): CRUD, application plan, atomic application."""

import uuid
from collections import Counter, defaultdict
from datetime import date

from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.modules.agenda import compatibility, rules
from app.modules.agenda.models import (
    WORKING_KINDS,
    HalfDay,
    HalfDayKind,
    Period,
    Task,
    WeekTemplate,
    WeekTemplateSlot,
)
from app.modules.agenda.schemas import (
    MAX_TEMPLATE_DAYS,
    ApplicationPlan,
    ApplyStrategy,
    HalfDayRead,
    HalfDayValues,
    PlanAction,
    PlannedHalfDay,
    Slot,
    TemplateApplication,
    TemplateSlot,
    WeekTemplateCreate,
    WeekTemplateRead,
    WeekTemplateUpdate,
)
from app.modules.agenda.service import HalfDayService, LockService, SubtypeService
from app.modules.auth.models import User
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject
from app.shared.ownership import get_owned, owned
from app.shared.schemas import name_already_used
from app.shared.text import normalize_text

WRITTEN = (PlanAction.CREATE, PlanAction.OVERWRITE)


def _unprocessable(code: ErrorCode, **params: object) -> AppError:
    return AppError(code, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, params=params)


class WeekTemplateService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    # --- reads -----------------------------------------------------------------------------

    async def get(self, template_id: uuid.UUID) -> WeekTemplate:
        return await get_owned(
            self.session, WeekTemplate, template_id, self.user.id, "weekTemplate"
        )

    async def _slots(self, template_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[TemplateSlot]]:
        result: dict[uuid.UUID, list[TemplateSlot]] = defaultdict(list)
        for slot in await self.session.scalars(
            select(WeekTemplateSlot)
            .where(WeekTemplateSlot.template_id.in_(template_ids))
            .order_by(WeekTemplateSlot.weekday, WeekTemplateSlot.period)
        ):
            result[slot.template_id].append(TemplateSlot.model_validate(slot))
        return result

    async def reads(self, templates: list[WeekTemplate]) -> list[WeekTemplateRead]:
        slots = await self._slots([t.id for t in templates])
        return [
            WeekTemplateRead(
                id=t.id,
                name=t.name,
                description=t.description,
                mission_id=t.mission_id,
                slots=slots[t.id],
                updated_at=t.updated_at,
            )
            for t in templates
        ]

    async def read(self, template: WeekTemplate) -> WeekTemplateRead:
        await self.session.refresh(template)
        return (await self.reads([template]))[0]

    async def search(self, mission_id: uuid.UUID | None) -> list[WeekTemplate]:
        query = owned(select(WeekTemplate), WeekTemplate, self.user.id)
        if mission_id is not None:
            query = query.where(WeekTemplate.mission_id == mission_id)
        return list(await self.session.scalars(query.order_by(WeekTemplate.normalized_name)))

    # --- writes ----------------------------------------------------------------------------

    async def _mission(self, mission_id: uuid.UUID | None) -> Mission | None:
        if mission_id is None:
            return None
        return await get_owned(self.session, Mission, mission_id, self.user.id, "mission")

    async def _unique(self, name: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name)
        query = owned(select(WeekTemplate.id), WeekTemplate, self.user.id).where(
            WeekTemplate.normalized_name == normalized
        )
        if exclude is not None:
            query = query.where(WeekTemplate.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("weekTemplate")
        return normalized

    async def _check_slots(self, slots: list[TemplateSlot]) -> None:
        seen: set[tuple[int, Period]] = set()
        for slot in slots:
            key = (slot.weekday, slot.period)
            if key in seen:
                raise _unprocessable(
                    ErrorCode.WEEK_TEMPLATE_DUPLICATE_SLOT,
                    weekday=slot.weekday,
                    period=slot.period.value,
                )
            seen.add(key)
            if slot.mission_id is not None:
                if slot.kind != HalfDayKind.MISSION:
                    raise _unprocessable(ErrorCode.HALF_DAY_MISSION_NOT_ALLOWED)
                await self._mission(slot.mission_id)
            if slot.subtype_id is not None:
                subtype = await SubtypeService(self.session).get(slot.subtype_id)
                if subtype.kind != slot.kind:
                    raise _unprocessable(ErrorCode.SUBTYPE_KIND_MISMATCH)
            if slot.location is not None and slot.kind not in WORKING_KINDS:
                raise _unprocessable(ErrorCode.LOCATION_NOT_ALLOWED)

    async def _replace_slots(self, template: WeekTemplate, slots: list[TemplateSlot]) -> None:
        await self.session.execute(
            delete(WeekTemplateSlot).where(WeekTemplateSlot.template_id == template.id)
        )
        self.session.add_all(
            WeekTemplateSlot(template_id=template.id, **slot.model_dump()) for slot in slots
        )

    async def create(self, data: WeekTemplateCreate) -> WeekTemplate:
        await self._mission(data.mission_id)
        await self._check_slots(data.slots)
        template = WeekTemplate(
            owner_id=self.user.id,
            name=data.name.strip(),
            normalized_name=await self._unique(data.name),
            description=data.description,
            mission_id=data.mission_id,
        )
        self.session.add(template)
        await self.session.flush()
        await self._replace_slots(template, data.slots)
        await self.session.commit()
        return template

    async def update(self, template_id: uuid.UUID, data: WeekTemplateUpdate) -> WeekTemplate:
        template = await self.get(template_id)
        if data.name is not None:
            template.normalized_name = await self._unique(data.name, template.id)
            template.name = data.name.strip()
        if data.description is not None:
            template.description = data.description
        if "mission_id" in data.model_fields_set:
            await self._mission(data.mission_id)
            template.mission_id = data.mission_id
        if data.slots is not None:
            await self._check_slots(data.slots)
            await self._replace_slots(template, data.slots)
        await self.session.commit()
        return template

    async def duplicate(self, template_id: uuid.UUID, name: str) -> WeekTemplate:
        source = await self.get(template_id)
        slots = (await self._slots([source.id]))[source.id]
        return await self.create(
            WeekTemplateCreate(
                name=name,
                description=source.description,
                mission_id=source.mission_id,
                slots=slots,
            )
        )

    async def delete(self, template_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(template_id))
        await self.session.commit()

    # --- application -----------------------------------------------------------------------

    async def _incompatible_half_days(
        self, rows: list[HalfDay], values: dict[uuid.UUID, HalfDayValues]
    ) -> set[uuid.UUID]:
        """Half-days whose tasks would not fit the new values (ADR-0020, ADR-0034)."""
        if not rows:
            return set()
        blocked: set[uuid.UUID] = set()
        for half_day_id, scope, subject_mission in await self.session.execute(
            select(Task.half_day_id, Subject.scope, Subject.mission_id)
            .join(Subject, Subject.id == Task.subject_id)
            .where(Task.half_day_id.in_([row.id for row in rows]))
        ):
            target = values[half_day_id]
            if not compatibility.is_compatible(
                target.kind, target.mission_id, scope, subject_mission
            ):
                blocked.add(half_day_id)
        return blocked

    async def plan(self, template: WeekTemplate, data: TemplateApplication) -> ApplicationPlan:
        """One action per half-day of the range holding a template slot (ADR-0035)."""
        if data.end < data.start:
            raise _unprocessable(ErrorCode.INVALID_DATE_RANGE)
        if (data.end - data.start).days >= MAX_TEMPLATE_DAYS:
            raise _unprocessable(ErrorCode.RANGE_TOO_LARGE, maxDays=MAX_TEMPLATE_DAYS)
        slots = {(s.weekday, s.period): s for s in (await self._slots([template.id]))[template.id]}
        fallback = data.mission_id or template.mission_id
        missions: dict[uuid.UUID, Mission] = {}
        for slot in slots.values():
            if slot.kind != HalfDayKind.MISSION:
                continue
            mission_id = slot.mission_id or fallback
            if mission_id is None:
                raise _unprocessable(ErrorCode.WEEK_TEMPLATE_MISSION_REQUIRED)
            if mission_id not in missions:
                mission = await self._mission(mission_id)
                assert mission is not None  # noqa: S101 - id is not None
                missions[mission_id] = mission

        targets: dict[tuple[date, Period], HalfDayValues] = {}
        for day in rules.days(data.start, data.end):
            for period in Period:
                match = slots.get((day.weekday(), period))
                if match is None:
                    continue
                targets[(day, period)] = HalfDayValues(
                    kind=match.kind,
                    subtype_id=match.subtype_id,
                    mission_id=(match.mission_id or fallback)
                    if match.kind == HalfDayKind.MISSION
                    else None,
                    location=match.location,
                )

        half_days = HalfDayService(self.session, self.user)
        existing = await half_days._existing(set(targets))
        holidays = rules.holidays_between(data.start, data.end, self.user.holiday_subdivision)
        locked = await LockService(self.session, self.user).locked_months(
            rules.months_of(d for d, _ in targets)
        )
        candidates = [
            row
            for key, row in existing.items()
            if not _same(row, targets[key]) and data.strategy == ApplyStrategy.OVERWRITE
        ]
        blocked = await self._incompatible_half_days(
            candidates, {row.id: targets[(row.date, row.period)] for row in candidates}
        )

        items: list[PlannedHalfDay] = []
        for (day, period), values in sorted(targets.items()):
            row = existing.get((day, period))
            mission = missions.get(values.mission_id) if values.mission_id else None
            if day in holidays:
                action = PlanAction.HOLIDAY
            elif (day.year, day.month) in locked:
                action = PlanAction.LOCKED
            elif mission is not None and not _in_mission(mission, day):
                action = PlanAction.OUTSIDE_MISSION
            elif row is None:
                action = PlanAction.CREATE
            elif _same(row, values):
                action = PlanAction.UNCHANGED
            elif data.strategy == ApplyStrategy.SKIP:
                action = PlanAction.KEEP
            elif row.id in blocked:
                action = PlanAction.BLOCKED_BY_TASKS
            else:
                action = PlanAction.OVERWRITE
            items.append(
                PlannedHalfDay(
                    date=day,
                    period=period,
                    action=action,
                    kind=values.kind,
                    subtype_id=values.subtype_id,
                    mission_id=values.mission_id,
                    location=values.location,
                    existing=HalfDayRead.model_validate(row) if row else None,
                )
            )
        return ApplicationPlan(
            start=data.start,
            end=data.end,
            strategy=data.strategy,
            items=items,
            counts=dict(Counter(item.action for item in items)),
        )

    async def apply(self, template_id: uuid.UUID, data: TemplateApplication) -> ApplicationPlan:
        """Writes the plan's CREATE and OVERWRITE half-days in one transaction (RG-10)."""
        template = await self.get(template_id)
        plan = await self.plan(template, data)
        entries = [
            (
                Slot(date=item.date, period=item.period),
                HalfDayValues(
                    kind=item.kind,
                    subtype_id=item.subtype_id,
                    mission_id=item.mission_id,
                    location=item.location,
                    # An overwritten half-day keeps its note.
                    note=item.existing.note if item.existing else None,
                ),
            )
            for item in plan.items
            if item.action in WRITTEN
        ]
        if entries:
            await HalfDayService(self.session, self.user).write(entries)
            await self.session.commit()
        plan.applied = len(entries)
        return plan


def _same(row: HalfDay, values: HalfDayValues) -> bool:
    return (row.kind, row.subtype_id, row.mission_id, row.location) == (
        values.kind,
        values.subtype_id,
        values.mission_id,
        values.location,
    )


def _in_mission(mission: Mission, day: date) -> bool:
    end = rules.mission_end(mission)
    return mission.start_date <= day and (end is None or day <= end)
