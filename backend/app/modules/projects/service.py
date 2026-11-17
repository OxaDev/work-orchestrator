"""Project use cases (ADR-0042). Personal data scoped to the owner (ADR-0010)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.modules.architecture.models import ProjectArchitecture
from app.modules.auth.models import User
from app.modules.directory.models import Company
from app.modules.directory.schemas import Summary
from app.modules.directory.service import summaries
from app.modules.documents.models import Document
from app.modules.missions.models import Mission
from app.modules.projects.models import Project
from app.modules.projects.schemas import ProjectCreate, ProjectSummary, ProjectUpdate
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used
from app.shared.text import normalize_text


class ProjectService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    async def get(self, project_id: uuid.UUID) -> Project:
        return await get_owned(self.session, Project, project_id, self.user.id, "project")

    async def search(
        self,
        *,
        mission_id: uuid.UUID | None,
        search: str | None,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Project], int]:
        query = owned(select(Project), Project, self.user.id)
        if mission_id is not None:
            query = query.where(Project.mission_id == mission_id)
        if search and (needle := search.strip().lower()):
            query = query.where(func.lower(Project.name).like(f"%{needle}%"))
        if not include_archived:
            query = query.where(Project.archived_at.is_(None))
        total = await self.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = await self.session.scalars(
            query.order_by(Project.normalized_name).limit(limit).offset(offset)
        )
        return list(rows), int(total or 0)

    async def summaries(self, projects: list[Project]) -> list[ProjectSummary]:
        ids = [p.id for p in projects]
        missions = {
            m.id: m
            for m in await self.session.scalars(
                select(Mission).where(Mission.id.in_({p.mission_id for p in projects}))
            )
        }
        clients = await summaries(self.session, Company, {m.client_id for m in missions.values()})
        documents = {
            project_id: int(count)
            for project_id, count in await self.session.execute(
                select(Document.project_id, func.count())
                .where(Document.project_id.in_(ids), Document.archived_at.is_(None))
                .group_by(Document.project_id)
            )
        }
        architectures = {
            project_id: int(count)
            for project_id, count in await self.session.execute(
                select(ProjectArchitecture.project_id, func.count())
                .where(ProjectArchitecture.project_id.in_(ids))
                .group_by(ProjectArchitecture.project_id)
            )
        }
        result = []
        for p in projects:
            mission = missions[p.mission_id]
            result.append(
                ProjectSummary(
                    id=p.id,
                    mission=Summary(id=mission.id, name=mission.title),
                    client=clients[mission.client_id],
                    name=p.name,
                    description=p.description,
                    archived_at=p.archived_at,
                    document_count=documents.get(p.id, 0),
                    architecture_count=architectures.get(p.id, 0),
                )
            )
        return result

    async def summary(self, project: Project) -> ProjectSummary:
        await self.session.refresh(project)
        return (await self.summaries([project]))[0]

    async def _unique(
        self, mission_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None
    ) -> str:
        normalized = normalize_text(name)
        query = select(Project.id).where(
            Project.mission_id == mission_id, Project.normalized_name == normalized
        )
        if exclude is not None:
            query = query.where(Project.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("project")
        return normalized

    async def create(self, data: ProjectCreate) -> Project:
        mission = await get_owned(self.session, Mission, data.mission_id, self.user.id, "mission")
        project = Project(
            owner_id=self.user.id,
            mission_id=mission.id,
            name=data.name.strip(),
            normalized_name=await self._unique(mission.id, data.name),
            description=data.description,
        )
        self.session.add(project)
        await self.session.commit()
        return project

    async def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        project = await self.get(project_id)
        if data.name is not None:
            project.normalized_name = await self._unique(project.mission_id, data.name, project.id)
            project.name = data.name.strip()
        if data.description is not None:
            project.description = data.description
        await self.session.commit()
        return project

    async def set_archived(self, project_id: uuid.UUID, archived: bool) -> Project:
        project = await self.get(project_id)
        project.archived_at = utcnow() if archived else None
        await self.session.commit()
        return project

    async def delete(self, project_id: uuid.UUID) -> None:
        """Refused while documents belong to the project (archive it instead); its architecture
        links go, the architectures stay with the client (ADR-0042)."""
        project = await self.get(project_id)
        if await self.session.scalar(
            select(Document.id).where(Document.project_id == project.id).limit(1)
        ):
            raise entity_referenced("project", "document")
        await self.session.delete(project)
        await self.session.commit()
