from pydantic import BaseModel

from app.modules.agenda.schemas import TaskRead
from app.modules.architecture.schemas import ArchitectureSummary
from app.modules.directory.schemas import Summary
from app.modules.documents.schemas import Backlink, DocumentSummary
from app.modules.missions.schemas import MissionSummary, RoleRead
from app.modules.technologies.models import TechnologyCategory


class SubjectTime(BaseModel):
    subject: Summary
    minutes: int
    task_count: int


class TimeSpent(BaseModel):
    half_days_done: int
    half_days_planned: int
    days_done: float
    days_planned: float
    # Working days from tomorrow to the effective end; None without an end date (ADR-0039).
    days_remaining: float | None
    done_minutes: int
    # DONE minutes by top-level subject, largest first.
    by_subject: list[SubjectTime]


class TechnologyWeight(BaseModel):
    technology: Summary
    category: TechnologyCategory
    # Manual weight 1-5; None when the technology is only suggested (Q-J2).
    weight: int | None
    version: str | None
    suggested_weight: int | None
    minutes: int


class ContactInRole(BaseModel):
    contact: Summary
    job_title: str | None


class RoleGroup(BaseModel):
    role: RoleRead | None
    contacts: list[ContactInRole]


class MissionOverview(BaseModel):
    mission: MissionSummary
    time: TimeSpent
    recent_tasks: list[TaskRead]
    planned_tasks: list[TaskRead]
    technologies: list[TechnologyWeight]
    contacts_by_role: list[RoleGroup]
    architectures: list[ArchitectureSummary]
    documents: list[DocumentSummary]
    backlinks: list[Backlink]


class TechnologyShare(BaseModel):
    technology: Summary
    weight: int


class CareerEntry(BaseModel):
    mission: MissionSummary
    days: float
    technologies: list[TechnologyShare]


class Career(BaseModel):
    missions: list[CareerEntry]
