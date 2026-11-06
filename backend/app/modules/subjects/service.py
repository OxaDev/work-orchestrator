"""Subject use cases (P5-1, P5-2, ADR-0034). Personal data scoped to the owner (ADR-0010)."""

import uuid
from collections.abc import Iterable

from fastapi import status
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import AppError, ErrorCode
from app.modules.agenda.models import Task, TaskStatus
from app.modules.auth.models import User
from app.modules.missions.models import Mission
from app.modules.subjects.models import Subject, SubjectCategory, SubjectScope
from app.modules.subjects.schemas import (
    CategoryCreate,
    CategoryUpdate,
    SubjectCreate,
    SubjectRead,
    SubjectUpdate,
)
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import normalize_text
from app.shared.tree import descendant_ids, ensure_valid_parent


def _unprocessable(code: ErrorCode) -> AppError:
    return AppError(code, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


def check_scope(scope: SubjectScope, mission_id: uuid.UUID | None) -> None:
    """Structural rule: a mission iff the scope is MISSION."""
    if scope == SubjectScope.MISSION and mission_id is None:
        raise _unprocessable(ErrorCode.SUBJECT_MISSION_REQUIRED)
    if scope != SubjectScope.MISSION and mission_id is not None:
        raise _unprocessable(ErrorCode.SUBJECT_MISSION_NOT_ALLOWED)


def _scope_mismatch() -> AppError:
    return _unprocessable(ErrorCode.SUBJECT_SCOPE_MISMATCH)


class SubjectService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    # --- reads -----------------------------------------------------------------------------

    async def get(self, subject_id: uuid.UUID) -> Subject:
        return await get_owned(self.session, Subject, subject_id, self.user.id, "subject")

    async def search(
        self,
        *,
        mission_id: uuid.UUID | None,
        scope: SubjectScope | None,
        search: str | None,
        include_archived: bool,
    ) -> list[Subject]:
        query = owned(select(Subject), Subject, self.user.id)
        if mission_id is not None:
            query = query.where(Subject.mission_id == mission_id)
        if scope is not None:
            query = query.where(Subject.scope == scope)
        if search and (needle := search.strip().lower()):
            query = query.where(func.lower(Subject.title).like(f"%{needle}%"))
        if not include_archived:
            query = query.where(Subject.archived_at.is_(None))
        return list(await self.session.scalars(query.order_by(func.lower(Subject.title))))

    async def reads(self, subjects: Iterable[Subject]) -> list[SubjectRead]:
        rows = list(subjects)
        done = case((Task.status == TaskStatus.DONE, Task.duration_minutes), else_=0)
        counts = {
            subject_id: (int(count), int(minutes or 0))
            for subject_id, count, minutes in await self.session.execute(
                select(Task.subject_id, func.count(Task.id), func.sum(done))
                .where(Task.subject_id.in_([s.id for s in rows]))
                .group_by(Task.subject_id)
            )
        }
        return [
            SubjectRead(
                id=s.id,
                parent_id=s.parent_id,
                scope=s.scope,
                mission_id=s.mission_id,
                category_id=s.category_id,
                title=s.title,
                status=s.status,
                external_url=s.external_url,
                description=s.description,
                archived_at=s.archived_at,
                task_count=counts.get(s.id, (0, 0))[0],
                done_minutes=counts.get(s.id, (0, 0))[1],
            )
            for s in rows
        ]

    async def read(self, subject: Subject) -> SubjectRead:
        return (await self.reads([subject]))[0]

    # --- writes ----------------------------------------------------------------------------

    async def _check_refs(
        self, mission_id: uuid.UUID | None, category_id: uuid.UUID | None
    ) -> None:
        if mission_id is not None:
            await get_owned(self.session, Mission, mission_id, self.user.id, "mission")
        if category_id is not None:
            await CategoryService(self.session).get(category_id)

    async def create(self, data: SubjectCreate) -> Subject:
        check_scope(data.scope, data.mission_id)
        await self._check_refs(data.mission_id, data.category_id)
        if data.parent_id is not None:
            parent = await self.get(data.parent_id)
            # RG-07: a child repeats its parent's scope and mission.
            if (parent.scope, parent.mission_id) != (data.scope, data.mission_id):
                raise _scope_mismatch()
        subject = Subject(
            owner_id=self.user.id,
            parent_id=data.parent_id,
            scope=data.scope,
            mission_id=data.mission_id,
            category_id=data.category_id,
            title=data.title.strip(),
            status=data.status,
            external_url=str(data.external_url) if data.external_url else None,
            description=data.description,
        )
        self.session.add(subject)
        await self.session.commit()
        return subject

    async def _subtree(self, subject: Subject) -> set[uuid.UUID]:
        return {subject.id} | await descendant_ids(self.session, Subject, subject.id)

    async def _has_tasks(self, ids: set[uuid.UUID]) -> bool:
        return (
            await self.session.scalar(select(Task.id).where(Task.subject_id.in_(ids)).limit(1))
        ) is not None

    async def update(self, subject_id: uuid.UUID, data: SubjectUpdate) -> Subject:
        subject = await self.get(subject_id)
        fields = data.model_fields_set
        if data.title is not None:
            subject.title = data.title.strip()
        if data.status is not None:
            subject.status = data.status
        if data.description is not None:
            subject.description = data.description
        if "external_url" in fields:
            subject.external_url = str(data.external_url) if data.external_url else None
        if "category_id" in fields:
            await self._check_refs(None, data.category_id)
            subject.category_id = data.category_id

        scope = data.scope or subject.scope
        mission_id = data.mission_id if "mission_id" in fields else subject.mission_id
        if data.scope is not None and "mission_id" not in fields and scope != SubjectScope.MISSION:
            mission_id = None  # leaving MISSION scope drops the mission
        parent_id = data.parent_id if "parent_id" in fields else subject.parent_id
        check_scope(scope, mission_id)

        if parent_id != subject.parent_id and parent_id is not None:
            parent = await self.get(parent_id)
            await ensure_valid_parent(self.session, Subject, subject.id, parent_id)  # RG-08
            if (parent.scope, parent.mission_id) != (scope, mission_id):
                raise _scope_mismatch()  # RG-07
        elif parent_id is not None and (scope, mission_id) != (subject.scope, subject.mission_id):
            raise _scope_mismatch()  # a child cannot diverge from its parent (RG-07)

        if (scope, mission_id) != (subject.scope, subject.mission_id):
            await self._check_refs(mission_id, None)
            subtree = await self._subtree(subject)
            # Placed tasks were validated against the old scope (ADR-0020).
            if await self._has_tasks(subtree):
                raise AppError(ErrorCode.SUBJECT_HAS_TASKS, status_code=status.HTTP_409_CONFLICT)
            await self.session.execute(
                update(Subject)
                .where(Subject.id.in_(subtree))
                .values(scope=scope, mission_id=mission_id)
                .execution_options(synchronize_session="fetch")
            )
        subject.parent_id = parent_id
        await self.session.commit()
        await self.session.refresh(subject)
        return subject

    async def set_archived(self, subject_id: uuid.UUID, archived: bool) -> Subject:
        """Archiving or restoring applies to the whole subtree."""
        subject = await self.get(subject_id)
        subtree = await self._subtree(subject)
        await self.session.execute(
            update(Subject)
            .where(Subject.id.in_(subtree))
            .values(archived_at=utcnow() if archived else None)
            .execution_options(synchronize_session="fetch")
        )
        await self.session.commit()
        await self.session.refresh(subject)
        return subject

    async def delete(self, subject_id: uuid.UUID) -> None:
        subject = await self.get(subject_id)
        if await self.session.scalar(select(Subject.id).where(Subject.parent_id == subject.id)):
            raise entity_referenced("subject", "subject")
        if await self._has_tasks({subject.id}):
            raise entity_referenced("subject", "task")
        from app.modules.architecture.links import delete_external_links
        from app.modules.architecture.models import LinkedEntity

        await delete_external_links(self.session, LinkedEntity.SUBJECT, subject.id)
        await self.session.delete(subject)
        await self.session.commit()


class CategoryService:
    """Subject categories: instance-wide referential (Q-G6)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all_with_usage(self) -> list[tuple[SubjectCategory, int]]:
        usage = func.count(Subject.id)
        rows = await self.session.execute(
            select(SubjectCategory, usage)
            .outerjoin(Subject, Subject.category_id == SubjectCategory.id)
            .group_by(SubjectCategory.id)
            .order_by(SubjectCategory.normalized_name)
        )
        return [(category, count) for category, count in rows]

    async def get(self, category_id: uuid.UUID) -> SubjectCategory:
        category = await self.session.get(SubjectCategory, category_id)
        if category is None:
            raise not_found("subjectCategory")
        return category

    async def _unique(self, name_fr: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name_fr)
        query = select(SubjectCategory.id).where(SubjectCategory.normalized_name == normalized)
        if exclude is not None:
            query = query.where(SubjectCategory.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("subjectCategory")
        return normalized

    async def create(self, data: CategoryCreate) -> SubjectCategory:
        category = SubjectCategory(
            name_fr=data.name_fr.strip(),
            name_en=data.name_en.strip(),
            normalized_name=await self._unique(data.name_fr),
        )
        self.session.add(category)
        await self.session.commit()
        return category

    async def update(self, category_id: uuid.UUID, data: CategoryUpdate) -> SubjectCategory:
        category = await self.get(category_id)
        if data.name_fr is not None:
            category.name_fr = data.name_fr.strip()
            category.normalized_name = await self._unique(category.name_fr, category.id)
        if data.name_en is not None:
            category.name_en = data.name_en.strip()
        await self.session.commit()
        return category

    async def delete(self, category_id: uuid.UUID) -> None:
        category = await self.get(category_id)
        if await self.session.scalar(
            select(Subject.id).where(Subject.category_id == category.id).limit(1)
        ):
            raise entity_referenced("subjectCategory", "subject")
        await self.session.delete(category)
        await self.session.commit()
