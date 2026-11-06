"""Document use cases (P7, ADR-0024, ADR-0036). Personal data scoped to the owner (ADR-0010)."""

import re
import uuid
from collections import defaultdict

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.modules.auth.models import User
from app.modules.documents import entities
from app.modules.documents.models import (
    Document,
    DocumentAttachment,
    DocumentLink,
    DocumentTemplate,
    DocumentVersion,
)
from app.modules.documents.schemas import (
    Backlink,
    DocumentCreate,
    DocumentDetail,
    DocumentSave,
    DocumentSummary,
    EntityRef,
    KnowledgeEdge,
    KnowledgeEdgeKind,
    KnowledgeGraph,
    KnowledgeNode,
    TemplateCreate,
    TemplateUpdate,
)
from app.modules.documents.wikilinks import LinkType, extract
from app.shared.ownership import get_owned, owned
from app.shared.schemas import entity_referenced, name_already_used, not_found
from app.shared.text import normalize_text
from app.shared.tree import descendant_ids, ensure_valid_parent

_NOT_SLUG = re.compile(r"[^a-z0-9]+")


def slugify(title: str) -> str:
    """'Fiche domaine : Paiements' -> 'fiche-domaine-paiements'."""
    return _NOT_SLUG.sub("-", normalize_text(title)).strip("-")[:200] or "document"


def summary(document: Document) -> DocumentSummary:
    return DocumentSummary(
        id=document.id,
        parent_id=document.parent_id,
        title=document.title,
        slug=document.slug,
        updated_at=document.updated_at,
        archived_at=document.archived_at,
        has_draft=document.draft_md is not None,
    )


class DocumentService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    # --- reads -----------------------------------------------------------------------------

    async def get(self, document_id: uuid.UUID) -> Document:
        return await get_owned(self.session, Document, document_id, self.user.id, "document")

    async def search(
        self,
        *,
        search: str | None,
        entity: tuple[LinkType, uuid.UUID] | None,
        include_archived: bool,
    ) -> list[Document]:
        query = owned(select(Document), Document, self.user.id)
        if search and (needle := search.strip().lower()):
            query = query.where(func.lower(Document.title).like(f"%{needle}%"))
        if entity is not None:
            query = query.where(
                Document.id.in_(
                    select(DocumentAttachment.document_id).where(
                        DocumentAttachment.entity_type == entity[0].value,
                        DocumentAttachment.entity_id == entity[1],
                    )
                )
            )
        if not include_archived:
            query = query.where(Document.archived_at.is_(None))
        return list(await self.session.scalars(query.order_by(func.lower(Document.title))))

    async def _refs(self, pairs: list[tuple[str, uuid.UUID]]) -> list[EntityRef]:
        by_type: dict[LinkType, set[uuid.UUID]] = defaultdict(set)
        for kind, entity_id in pairs:
            by_type[LinkType(kind)].add(entity_id)
        found = {
            kind: await entities.labels(self.session, self.user, kind, ids)
            for kind, ids in by_type.items()
        }
        return [
            EntityRef(type=LinkType(kind), id=entity_id, label=found[LinkType(kind)].get(entity_id))
            for kind, entity_id in pairs
        ]

    async def detail(self, document: Document) -> DocumentDetail:
        await self.session.refresh(document)
        attached = [
            (kind, entity_id)
            for kind, entity_id in await self.session.execute(
                select(DocumentAttachment.entity_type, DocumentAttachment.entity_id)
                .where(DocumentAttachment.document_id == document.id)
                .order_by(DocumentAttachment.entity_type)
            )
        ]
        links = [
            (kind, target_id)
            for kind, target_id in await self.session.execute(
                select(DocumentLink.target_type, DocumentLink.target_id)
                .where(DocumentLink.document_id == document.id)
                .order_by(DocumentLink.label)
            )
        ]
        version_count = await self.session.scalar(
            select(func.count()).where(DocumentVersion.document_id == document.id)
        )
        return DocumentDetail(
            **summary(document).model_dump(),
            content_md=document.content_md,
            draft_md=document.draft_md,
            draft_saved_at=document.draft_saved_at,
            version_count=version_count or 0,
            entities=await self._refs(attached),
            links=await self._refs(links),
        )

    async def backlinks(self, kind: LinkType, target_id: uuid.UUID) -> list[Backlink]:
        rows = await self.session.execute(
            owned(select(Document, DocumentLink.label), Document, self.user.id)
            .join(DocumentLink, DocumentLink.document_id == Document.id)
            .where(
                DocumentLink.target_type == kind.value,
                DocumentLink.target_id == target_id,
                Document.archived_at.is_(None),
            )
            .order_by(func.lower(Document.title))
        )
        return [Backlink(document=summary(document), label=label) for document, label in rows]

    async def knowledge_graph(self) -> KnowledgeGraph:
        """Documents and the entities they link to or are attached to (P9-12, ADR-0038)."""
        documents = await self.search(search=None, entity=None, include_archived=False)
        doc_ids = [d.id for d in documents]
        pairs: list[tuple[uuid.UUID, str, uuid.UUID, KnowledgeEdgeKind]] = [
            (doc_id, kind, target, KnowledgeEdgeKind.LINK)
            for doc_id, kind, target in await self.session.execute(
                select(
                    DocumentLink.document_id, DocumentLink.target_type, DocumentLink.target_id
                ).where(DocumentLink.document_id.in_(doc_ids))
            )
        ] + [
            (doc_id, kind, target, KnowledgeEdgeKind.ATTACHMENT)
            for doc_id, kind, target in await self.session.execute(
                select(
                    DocumentAttachment.document_id,
                    DocumentAttachment.entity_type,
                    DocumentAttachment.entity_id,
                ).where(DocumentAttachment.document_id.in_(doc_ids))
            )
        ]
        targets: dict[LinkType, set[uuid.UUID]] = defaultdict(set)
        for _, kind, target, _ in pairs:
            targets[LinkType(kind)].add(target)
        labels: dict[tuple[LinkType, uuid.UUID], str] = {
            (LinkType.DOCUMENT, d.id): d.title for d in documents
        }
        for kind, ids in targets.items():
            for target_id, label in (
                await entities.labels(self.session, self.user, kind, ids)
            ).items():
                labels[(kind, target_id)] = label
        # Dangling or foreign targets are left out: nothing to show for them.
        edges = [
            KnowledgeEdge(
                source_type=LinkType.DOCUMENT,
                source_id=doc_id,
                target_type=LinkType(kind),
                target_id=target,
                kind=edge_kind,
            )
            for doc_id, kind, target, edge_kind in pairs
            if (LinkType(kind), target) in labels
        ]
        nodes = [
            KnowledgeNode(type=kind, id=node_id, label=label)
            for (kind, node_id), label in sorted(labels.items(), key=lambda item: item[1].lower())
        ]
        return KnowledgeGraph(nodes=nodes, edges=edges)

    # --- writes ----------------------------------------------------------------------------

    async def _slug(self, title: str, exclude: uuid.UUID | None = None) -> str:
        base = slugify(title)
        query = owned(select(Document.slug), Document, self.user.id).where(
            Document.slug.like(f"{base}%")
        )
        if exclude is not None:
            query = query.where(Document.id != exclude)
        taken = set(await self.session.scalars(query))
        slug, number = base, 2
        while slug in taken:
            slug, number = f"{base}-{number}", number + 1
        return slug

    async def _version(self, document: Document) -> None:
        number = await self.session.scalar(
            select(func.coalesce(func.max(DocumentVersion.number), 0)).where(
                DocumentVersion.document_id == document.id
            )
        )
        self.session.add(
            DocumentVersion(
                document_id=document.id,
                number=(number or 0) + 1,
                title=document.title,
                content_md=document.content_md,
                created_at=utcnow(),
            )
        )

    async def _relink(self, document: Document) -> None:
        """Rebuilds the outgoing wikilinks (backlinks of their targets)."""
        await self.session.execute(
            delete(DocumentLink).where(DocumentLink.document_id == document.id)
        )
        self.session.add_all(
            DocumentLink(
                document_id=document.id,
                target_type=link.type.value,
                target_id=link.id,
                label=(link.label or link.type.value)[:200],
            )
            for link in extract(document.content_md)
        )

    async def create(self, data: DocumentCreate) -> Document:
        if data.parent_id is not None:
            await self.get(data.parent_id)
        content = data.content_md
        if not content and data.template_id is not None:
            content = (await TemplateService(self.session).get(data.template_id)).content_md
        target = data.attach_to
        if target is not None:
            await entities.ensure_visible(self.session, self.user, target.type, target.id)
        document = Document(
            owner_id=self.user.id,
            parent_id=data.parent_id,
            title=data.title.strip(),
            slug=await self._slug(data.title),
            content_md=content,
        )
        self.session.add(document)
        await self.session.flush()
        await self._version(document)
        await self._relink(document)
        if target is not None:
            self.session.add(
                DocumentAttachment(
                    document_id=document.id, entity_type=target.type.value, entity_id=target.id
                )
            )
        await self.session.commit()
        return document

    async def save(self, document_id: uuid.UUID, data: DocumentSave) -> Document:
        document = await self.get(document_id)
        title = data.title.strip()
        changed = (title, data.content_md) != (document.title, document.content_md)
        if title != document.title:
            document.slug = await self._slug(title, document.id)
        document.title = title
        document.content_md = data.content_md
        document.draft_md = None
        document.draft_saved_at = None
        if changed:
            await self._version(document)
            await self._relink(document)
        await self.session.commit()
        return document

    async def save_draft(self, document_id: uuid.UUID, content: str | None) -> Document:
        document = await self.get(document_id)
        document.draft_md = content
        document.draft_saved_at = utcnow() if content is not None else None
        await self.session.commit()
        return document

    async def move(self, document_id: uuid.UUID, parent_id: uuid.UUID | None) -> Document:
        document = await self.get(document_id)
        if parent_id is not None:
            await self.get(parent_id)
            await ensure_valid_parent(self.session, Document, document.id, parent_id)
        document.parent_id = parent_id
        await self.session.commit()
        return document

    async def set_archived(self, document_id: uuid.UUID, archived: bool) -> Document:
        """Archiving or restoring applies to the page and its sub-pages."""
        document = await self.get(document_id)
        subtree = {document.id} | await descendant_ids(self.session, Document, document.id)
        await self.session.execute(
            update(Document)
            .where(Document.id.in_(subtree))
            .values(archived_at=utcnow() if archived else None)
            .execution_options(synchronize_session="fetch")
        )
        await self.session.commit()
        return document

    async def delete(self, document_id: uuid.UUID) -> None:
        document = await self.get(document_id)
        if await self.session.scalar(
            select(Document.id).where(Document.parent_id == document.id).limit(1)
        ):
            raise entity_referenced("document", "document")
        await self.session.delete(document)
        await self.session.commit()

    async def versions(
        self, document_id: uuid.UUID, limit: int = 100, offset: int = 0
    ) -> list[DocumentVersion]:
        document = await self.get(document_id)
        rows = await self.session.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document.id)
            .order_by(DocumentVersion.number.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows)

    async def version(self, document_id: uuid.UUID, number: int) -> DocumentVersion:
        document = await self.get(document_id)
        version: DocumentVersion | None = await self.session.scalar(
            select(DocumentVersion).where(
                DocumentVersion.document_id == document.id, DocumentVersion.number == number
            )
        )
        if version is None:
            raise not_found("documentVersion")
        return version

    async def restore(self, document_id: uuid.UUID, number: int) -> Document:
        """Restoring creates a new version with the old content (ADR-0024)."""
        version = await self.version(document_id, number)
        return await self.save(
            document_id, DocumentSave(title=version.title, content_md=version.content_md)
        )

    async def attach(self, document_id: uuid.UUID, kind: LinkType, entity_id: uuid.UUID) -> None:
        document = await self.get(document_id)
        await entities.ensure_visible(self.session, self.user, kind, entity_id)
        exists = await self.session.get(DocumentAttachment, (document.id, kind.value, entity_id))
        if exists is None:
            self.session.add(
                DocumentAttachment(
                    document_id=document.id, entity_type=kind.value, entity_id=entity_id
                )
            )
            await self.session.commit()

    async def detach(self, document_id: uuid.UUID, kind: LinkType, entity_id: uuid.UUID) -> None:
        document = await self.get(document_id)
        link = await self.session.get(DocumentAttachment, (document.id, kind.value, entity_id))
        if link is None:
            raise not_found("documentAttachment")
        await self.session.delete(link)
        await self.session.commit()


class TemplateService:
    """Document templates: instance-wide referential (Q-I7)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all(self) -> list[DocumentTemplate]:
        return list(
            await self.session.scalars(
                select(DocumentTemplate).order_by(DocumentTemplate.normalized_name)
            )
        )

    async def get(self, template_id: uuid.UUID) -> DocumentTemplate:
        template = await self.session.get(DocumentTemplate, template_id)
        if template is None:
            raise not_found("documentTemplate")
        return template

    async def _unique(self, name_fr: str, exclude: uuid.UUID | None = None) -> str:
        normalized = normalize_text(name_fr)
        query = select(DocumentTemplate.id).where(DocumentTemplate.normalized_name == normalized)
        if exclude is not None:
            query = query.where(DocumentTemplate.id != exclude)
        if await self.session.scalar(query) is not None:
            raise name_already_used("documentTemplate")
        return normalized

    async def create(self, data: TemplateCreate) -> DocumentTemplate:
        template = DocumentTemplate(
            name_fr=data.name_fr.strip(),
            name_en=data.name_en.strip(),
            normalized_name=await self._unique(data.name_fr),
            content_md=data.content_md,
        )
        self.session.add(template)
        await self.session.commit()
        return template

    async def update(self, template_id: uuid.UUID, data: TemplateUpdate) -> DocumentTemplate:
        template = await self.get(template_id)
        if data.name_fr is not None:
            template.normalized_name = await self._unique(data.name_fr, template.id)
            template.name_fr = data.name_fr.strip()
        if data.name_en is not None:
            template.name_en = data.name_en.strip()
        if data.content_md is not None:
            template.content_md = data.content_md
        await self.session.commit()
        return template

    async def delete(self, template_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(template_id))
        await self.session.commit()
