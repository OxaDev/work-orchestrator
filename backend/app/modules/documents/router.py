"""Document, file, link and template endpoints (P7). Personal data scoped to the user (ADR-0010)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.modules.auth.dependencies import AppSettings, CurrentUser, DbSession
from app.modules.documents import entities
from app.modules.documents.files import AttachmentService
from app.modules.documents.markdown_import import MarkdownImporter
from app.modules.documents.schemas import (
    AttachmentRead,
    Backlink,
    DocumentCreate,
    DocumentDetail,
    DocumentMove,
    DocumentSave,
    DocumentSummary,
    DraftSave,
    KnowledgeGraph,
    LinkSearchResult,
    MarkdownImportReportRead,
    TemplateCreate,
    TemplateRead,
    TemplateUpdate,
    VersionRead,
    VersionSummary,
)
from app.modules.documents.service import DocumentService, TemplateService, summary
from app.modules.documents.wikilinks import LinkType
from app.shared.schemas import IncludeArchived, Limit, Offset, Search

router = APIRouter(prefix="/documents", tags=["documents"])
templates_router = APIRouter(prefix="/document-templates", tags=["document-templates"])
attachments_router = APIRouter(prefix="/attachments", tags=["attachments"])
links_router = APIRouter(tags=["links"])

NO_CONTENT = status.HTTP_204_NO_CONTENT


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    user: CurrentUser,
    session: DbSession,
    q: Search = None,
    entity_type: LinkType | None = None,
    entity_id: uuid.UUID | None = None,
    include_archived: IncludeArchived = False,
    project_id: uuid.UUID | None = None,
    mission_id: uuid.UUID | None = None,
    unfiled: bool = False,
) -> list[DocumentSummary]:
    """Flat list (parent_id links, the client builds the tree); optionally those attached to an
    entity, those of a project or of a mission's projects, or those of no project (`unfiled`,
    ADR-0042)."""
    entity = (entity_type, entity_id) if entity_type and entity_id else None
    rows = await DocumentService(session, user).search(
        search=q,
        entity=entity,
        include_archived=include_archived,
        project_id=project_id,
        mission_id=mission_id,
        unfiled=unfiled,
    )
    return [summary(row) for row in rows]


@router.post("", response_model=DocumentDetail, status_code=status.HTTP_201_CREATED)
async def create_document(
    body: DocumentCreate, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.create(body))


@router.get("/{document_id}", response_model=DocumentDetail)
async def read_document(
    document_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.get(document_id))


@router.put("/{document_id}", response_model=DocumentDetail)
async def save_document(
    document_id: uuid.UUID, body: DocumentSave, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    """Explicit save: new version if anything changed, draft cleared, wikilinks re-extracted."""
    service = DocumentService(session, user)
    return await service.detail(await service.save(document_id, body))


@router.put("/{document_id}/draft", response_model=DocumentDetail)
async def save_draft(
    document_id: uuid.UUID, body: DraftSave, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    """Autosave: keeps the draft, creates no version (ADR-0024)."""
    service = DocumentService(session, user)
    return await service.detail(await service.save_draft(document_id, body.content_md))


@router.delete("/{document_id}/draft", response_model=DocumentDetail)
async def discard_draft(
    document_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.save_draft(document_id, None))


@router.post("/import-markdown", response_model=MarkdownImportReportRead)
async def import_markdown(
    user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
    file: Annotated[UploadFile, File()],
    parent_id: Annotated[uuid.UUID | None, Form()] = None,
    project_id: Annotated[uuid.UUID | None, Form()] = None,
) -> MarkdownImportReportRead:
    """A zipped folder of Markdown notes (Obsidian vault): up to 50 MB and 2,000 files. Pages go
    into the parent's project, or `project_id` at the top level (ADR-0042)."""
    report = await MarkdownImporter(session, user, settings).run(file, parent_id, project_id)
    return MarkdownImportReportRead(**report.__dict__)


@router.post("/{document_id}/move", response_model=DocumentDetail)
async def move_document(
    document_id: uuid.UUID, body: DocumentMove, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.move(document_id, body))


@router.post("/{document_id}/archive", response_model=DocumentDetail)
async def archive_document(
    document_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.set_archived(document_id, True))


@router.post("/{document_id}/restore", response_model=DocumentDetail)
async def restore_document(
    document_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    service = DocumentService(session, user)
    return await service.detail(await service.set_archived(document_id, False))


@router.delete("/{document_id}", status_code=NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    await DocumentService(session, user).delete(document_id)
    return Response(status_code=NO_CONTENT)


@router.get("/{document_id}/versions", response_model=list[VersionSummary])
async def list_versions(
    document_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    limit: Limit = 100,
    offset: Offset = 0,
) -> list[VersionSummary]:
    """Newest first; every save makes a version, so the history is paged (P12-2)."""
    rows = await DocumentService(session, user).versions(document_id, limit, offset)
    return [VersionSummary.model_validate(row) for row in rows]


@router.get("/{document_id}/versions/{number}", response_model=VersionRead)
async def read_version(
    document_id: uuid.UUID, number: int, user: CurrentUser, session: DbSession
) -> VersionRead:
    return VersionRead.model_validate(
        await DocumentService(session, user).version(document_id, number)
    )


@router.post("/{document_id}/versions/{number}/restore", response_model=DocumentDetail)
async def restore_version(
    document_id: uuid.UUID, number: int, user: CurrentUser, session: DbSession
) -> DocumentDetail:
    """Restoring creates a new version holding the old content."""
    service = DocumentService(session, user)
    return await service.detail(await service.restore(document_id, number))


@router.put("/{document_id}/entities/{entity_type}/{entity_id}", response_model=DocumentDetail)
async def attach_document(
    document_id: uuid.UUID,
    entity_type: LinkType,
    entity_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
) -> DocumentDetail:
    service = DocumentService(session, user)
    await service.attach(document_id, entity_type, entity_id)
    return await service.detail(await service.get(document_id))


@router.delete("/{document_id}/entities/{entity_type}/{entity_id}", response_model=DocumentDetail)
async def detach_document(
    document_id: uuid.UUID,
    entity_type: LinkType,
    entity_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
) -> DocumentDetail:
    service = DocumentService(session, user)
    await service.detach(document_id, entity_type, entity_id)
    return await service.detail(await service.get(document_id))


# --- links ----------------------------------------------------------------------------------


@links_router.get("/links/search", response_model=list[LinkSearchResult])
async def search_links(
    user: CurrentUser,
    session: DbSession,
    q: Annotated[str, Query(max_length=200)] = "",
    types: Annotated[list[LinkType] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[LinkSearchResult]:
    """Entities whose name contains `q`, for the `[[` completion (P7-9)."""
    kinds = types or list(entities.ENTITY_TYPES)
    return [
        LinkSearchResult(type=kind, id=entity_id, label=label)
        for kind, entity_id, label in await entities.search(session, user, q, kinds, limit)
    ]


@links_router.get("/links/graph", response_model=KnowledgeGraph)
async def knowledge_graph(user: CurrentUser, session: DbSession) -> KnowledgeGraph:
    """Documents and the entities they link to or are attached to (P9-12)."""
    return await DocumentService(session, user).knowledge_graph()


@links_router.get("/backlinks", response_model=list[Backlink])
async def backlinks(
    user: CurrentUser,
    session: DbSession,
    type_: Annotated[LinkType, Query(alias="type")],
    id_: Annotated[uuid.UUID, Query(alias="id")],
) -> list[Backlink]:
    """The user's documents whose wikilinks point to an entity."""
    return await DocumentService(session, user).backlinks(type_, id_)


# --- files ----------------------------------------------------------------------------------


@attachments_router.post("", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
    file: Annotated[UploadFile, File()],
    document_id: Annotated[uuid.UUID | None, Form()] = None,
) -> AttachmentRead:
    """Images and files up to 20 MB, allowed types only (ADR-0027)."""
    attachment = await AttachmentService(session, user, settings).upload(file, document_id)
    return AttachmentRead.model_validate(attachment)


@attachments_router.get("/{attachment_id}", response_class=FileResponse)
async def download_attachment(
    attachment_id: uuid.UUID, user: CurrentUser, session: DbSession, settings: AppSettings
) -> FileResponse:
    service = AttachmentService(session, user, settings)
    attachment = await service.get(attachment_id)
    return FileResponse(
        service.path(attachment),
        media_type=attachment.mime_type,
        headers=service.headers(attachment),
    )


@attachments_router.delete("/{attachment_id}", status_code=NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID, user: CurrentUser, session: DbSession, settings: AppSettings
) -> Response:
    await AttachmentService(session, user, settings).delete(attachment_id)
    return Response(status_code=NO_CONTENT)


# --- templates (shared referential) ---------------------------------------------------------


@templates_router.get("", response_model=list[TemplateRead])
async def list_templates(session: DbSession) -> list[TemplateRead]:
    return [TemplateRead.model_validate(t) for t in await TemplateService(session).all()]


@templates_router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(body: TemplateCreate, session: DbSession) -> TemplateRead:
    return TemplateRead.model_validate(await TemplateService(session).create(body))


@templates_router.patch("/{template_id}", response_model=TemplateRead)
async def update_template(
    template_id: uuid.UUID, body: TemplateUpdate, session: DbSession
) -> TemplateRead:
    return TemplateRead.model_validate(await TemplateService(session).update(template_id, body))


@templates_router.delete("/{template_id}", status_code=NO_CONTENT)
async def delete_template(template_id: uuid.UUID, session: DbSession) -> Response:
    await TemplateService(session).delete(template_id)
    return Response(status_code=NO_CONTENT)
