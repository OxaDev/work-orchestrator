import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.modules.documents.wikilinks import LinkType

Title = Field(min_length=1, max_length=200)
Markdown = Field(default="", max_length=500_000)


class EntityRef(BaseModel):
    type: LinkType
    id: uuid.UUID
    # Current label; None when the entity no longer exists or is not visible.
    label: str | None


class DocumentSummary(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    # ADR-0042: the project of the page's tree; None = unfiled.
    project_id: uuid.UUID | None
    title: str
    slug: str
    updated_at: datetime
    archived_at: datetime | None
    has_draft: bool


class DocumentDetail(DocumentSummary):
    content_md: str
    draft_md: str | None
    draft_saved_at: datetime | None
    version_count: int
    entities: list[EntityRef]
    links: list[EntityRef]


class DocumentCreate(BaseModel):
    title: str = Title
    parent_id: uuid.UUID | None = None
    # Ignored when parent_id is set: a sub-page takes its parent's project (ADR-0042).
    project_id: uuid.UUID | None = None
    content_md: str = Markdown
    # Starts from a template's content when content_md is empty.
    template_id: uuid.UUID | None = None
    # Attaches the new document to an entity (e.g. created from a mission page).
    attach_to: "EntityTarget | None" = None


class DocumentSave(BaseModel):
    """Explicit save: creates a version when title or content changed (ADR-0024)."""

    title: str = Title
    content_md: str = Markdown


class DocumentMove(BaseModel):
    """Moves a page and its sub-pages. Under a parent, they take the parent's project; at the top
    level, `project_id` (when sent) files them in that project, or unfiles them when null."""

    parent_id: uuid.UUID | None
    project_id: uuid.UUID | None = None


class DraftSave(BaseModel):
    content_md: str = Markdown


class EntityTarget(BaseModel):
    type: LinkType
    id: uuid.UUID


class VersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: int
    title: str
    created_at: datetime


class VersionRead(VersionSummary):
    content_md: str


class Backlink(BaseModel):
    document: DocumentSummary
    label: str


class LinkSearchResult(BaseModel):
    type: LinkType
    id: uuid.UUID
    label: str


class KnowledgeNode(BaseModel):
    type: LinkType
    id: uuid.UUID
    label: str


class KnowledgeEdgeKind(StrEnum):
    LINK = "LINK"  # a wikilink in the document
    ATTACHMENT = "ATTACHMENT"  # the document is attached to the entity


class KnowledgeEdge(BaseModel):
    source_type: LinkType
    source_id: uuid.UUID
    target_type: LinkType
    target_id: uuid.UUID
    kind: KnowledgeEdgeKind


class KnowledgeGraph(BaseModel):
    nodes: list[KnowledgeNode]
    edges: list[KnowledgeEdge]


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID | None
    filename: str
    mime_type: str
    size: int
    created_at: datetime


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_fr: str
    name_en: str
    content_md: str


class TemplateCreate(BaseModel):
    name_fr: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    content_md: str = Markdown


class TemplateUpdate(BaseModel):
    name_fr: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    content_md: str | None = Field(default=None, max_length=500_000)


DocumentCreate.model_rebuild()


class MarkdownImportReportRead(BaseModel):
    documents: int
    folders: int
    attachments: int
    # Wikilinks and embeds naming nothing in the archive, left as written.
    unresolved_links: int
    # Embedded files refused by the upload rules (type, signature, size).
    skipped_files: int
    # Top-level pages created, to open after the import.
    root_ids: list[uuid.UUID]
