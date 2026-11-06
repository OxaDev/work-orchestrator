import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.modules.architecture.models import (
    Criticality,
    DomainKind,
    ExternalLinkKind,
    Lifecycle,
    LinkedEntity,
    RelationType,
    SyncMode,
)
from app.modules.directory.schemas import Summary
from app.modules.subjects.models import SubjectScope, SubjectStatus
from app.modules.technologies.models import TechnologyCategory

Name = Field(min_length=1, max_length=200)
Markdown = Field(default="", max_length=100_000)


# --- domains ---------------------------------------------------------------------------------


class DomainSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    kind: DomainKind
    lifecycle: Lifecycle
    criticality: Criticality | None
    archived_at: datetime | None


class DomainRef(BaseModel):
    id: uuid.UUID
    name: str
    kind: DomainKind


class OrgUnitRef(BaseModel):
    id: uuid.UUID
    name: str
    level_label: str


class RelationRead(BaseModel):
    id: uuid.UUID
    source: DomainRef
    target: DomainRef
    type: RelationType
    label: str | None
    protocol: str | None
    sync_mode: SyncMode | None
    lifecycle: Lifecycle
    description: str


class DomainTechnologyRead(BaseModel):
    technology: Summary
    category: TechnologyCategory
    version: str | None


class LinkedSubject(BaseModel):
    id: uuid.UUID
    title: str
    scope: SubjectScope
    mission_id: uuid.UUID | None
    status: SubjectStatus


class ExternalLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: LinkedEntity
    entity_id: uuid.UUID
    kind: ExternalLinkKind
    label: str
    url: str


class DomainDetail(DomainSummary):
    company: Summary
    description: str
    owner_org_unit: OrgUnitRef | None
    # Org chain from the top (direction > pôle > équipe), ending with the owner unit (Q-H6).
    owner_chain: list[OrgUnitRef]
    referent_contact: Summary | None
    ancestors: list[DomainSummary]
    children: list[DomainSummary]
    outgoing: list[RelationRead]
    incoming: list[RelationRead]
    technologies: list[DomainTechnologyRead]
    subjects: list[LinkedSubject]
    # Architectures holding this domain, directly or through an ancestor (ADR-0037).
    architectures: list[Summary]
    external_links: list[ExternalLinkRead]


class DomainCreate(BaseModel):
    company_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str = Name
    kind: DomainKind
    description: str = Markdown
    criticality: Criticality | None = None
    lifecycle: Lifecycle = Lifecycle.CURRENT
    owner_org_unit_id: uuid.UUID | None = None
    referent_contact_id: uuid.UUID | None = None
    # Adds the new domain to this architecture's members.
    architecture_id: uuid.UUID | None = None


class DomainUpdate(BaseModel):
    """Omitted fields are unchanged; `parent_id: null` moves the domain to the top."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: uuid.UUID | None = None
    kind: DomainKind | None = None
    description: str | None = Field(default=None, max_length=100_000)
    criticality: Criticality | None = None
    lifecycle: Lifecycle | None = None
    owner_org_unit_id: uuid.UUID | None = None
    referent_contact_id: uuid.UUID | None = None


class DomainTechnologyUpsert(BaseModel):
    version: str | None = Field(default=None, max_length=50)


# --- relations -------------------------------------------------------------------------------


class RelationCreate(BaseModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    type: RelationType
    label: str | None = Field(default=None, max_length=200)
    protocol: str | None = Field(default=None, max_length=60)
    sync_mode: SyncMode | None = None
    lifecycle: Lifecycle = Lifecycle.CURRENT
    description: str = Markdown


class RelationUpdate(BaseModel):
    source_id: uuid.UUID | None = None
    target_id: uuid.UUID | None = None
    type: RelationType | None = None
    label: str | None = Field(default=None, max_length=200)
    protocol: str | None = Field(default=None, max_length=60)
    sync_mode: SyncMode | None = None
    lifecycle: Lifecycle | None = None
    description: str | None = Field(default=None, max_length=100_000)


# --- architectures ---------------------------------------------------------------------------


class ArchitectureSummary(BaseModel):
    id: uuid.UUID
    company: Summary
    name: str
    lifecycle: Lifecycle
    archived_at: datetime | None
    member_count: int
    missions: list[Summary]


class ArchitectureDetail(ArchitectureSummary):
    description: str
    members: list[DomainSummary]
    updated_at: datetime


class ArchitectureCreate(BaseModel):
    company_id: uuid.UUID
    name: str = Name
    description: str = Markdown
    lifecycle: Lifecycle = Lifecycle.CURRENT
    # Links the new architecture to a mission of the same client.
    mission_id: uuid.UUID | None = None


class ArchitectureUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=100_000)
    lifecycle: Lifecycle | None = None


class GraphNode(BaseModel):
    id: uuid.UUID
    # Nearest ancestor present in the graph (ADR-0037).
    parent_id: uuid.UUID | None
    name: str
    kind: DomainKind
    lifecycle: Lifecycle
    criticality: Criticality | None
    # Levels below the member domain it comes from (0 for members).
    depth: int
    member: bool
    # Owner org unit, for node cards and the team filter (ADR-0038).
    owner: Summary | None


class GraphEdge(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    type: RelationType
    label: str | None
    protocol: str | None
    sync_mode: SyncMode | None
    lifecycle: Lifecycle


class Graph(BaseModel):
    architecture: Summary
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# --- external links --------------------------------------------------------------------------


class ExternalLinkCreate(BaseModel):
    entity_type: LinkedEntity
    entity_id: uuid.UUID
    kind: ExternalLinkKind = ExternalLinkKind.OTHER
    label: str = Field(min_length=1, max_length=200)
    url: HttpUrl


class ExternalLinkUpdate(BaseModel):
    kind: ExternalLinkKind | None = None
    label: str | None = Field(default=None, min_length=1, max_length=200)
    url: HttpUrl | None = None


# --- graph view and export (ADR-0038) ------------------------------------------------------


class GraphView(StrEnum):
    """CURRENT: what runs today; TARGET: what will run; BOTH: everything, changes marked."""

    CURRENT = "CURRENT"
    TARGET = "TARGET"
    BOTH = "BOTH"


class MermaidFormat(StrEnum):
    FLOWCHART = "flowchart"
    MINDMAP = "mindmap"


class Direction(StrEnum):
    LR = "LR"
    TB = "TB"


class ExportLanguage(StrEnum):
    FR = "fr"
    EN = "en"


class MermaidExport(BaseModel):
    format: MermaidFormat
    code: str


class NodePosition(BaseModel):
    domain_id: uuid.UUID
    x: float
    y: float


class LayoutSave(BaseModel):
    positions: list[NodePosition] = Field(max_length=2000)
