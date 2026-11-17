/** In-memory fake of the documents API (P7) for component tests. */

import { http, HttpResponse } from "msw";

import type {
  DocumentDetail,
  DocumentTemplate,
  EntityRef,
  LinkSearchResult,
} from "../features/documents/api";
import { missionIds } from "./missionsBackend";
import { projects } from "./projectsBackend";

let sequence = 0;
const nextId = () => `00000000-0000-7000-d000-${String(++sequence).padStart(12, "0")}`;
const NOW = "2026-11-06T10:00:00Z";

interface StoredDocument extends DocumentDetail {
  versions: { number: number; title: string; content_md: string; created_at: string }[];
}

export const docs = {
  items: [] as StoredDocument[],
  templates: [] as DocumentTemplate[],
  searchable: [] as LinkSearchResult[],
  backlinks: [] as { type: string; id: string; documentId: string; label: string }[],
  lastBody: null as unknown,
  lastUrl: "",
  uploads: [] as { id: string; name: string }[],
};
export const docIds = { root: "", child: "", template: "" };

export function addDocument(fields: Partial<DocumentDetail> & Pick<DocumentDetail, "title">) {
  const content = fields.content_md ?? "";
  const document: StoredDocument = {
    id: nextId(),
    parent_id: null,
    project_id: null,
    slug: fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    updated_at: NOW,
    archived_at: null,
    has_draft: false,
    content_md: content,
    draft_md: null,
    draft_saved_at: null,
    version_count: 1,
    entities: [],
    links: [],
    ...fields,
    versions: [{ number: 1, title: fields.title, content_md: content, created_at: NOW }],
  };
  docs.items.push(document);
  return document;
}

export function resetDocuments(): void {
  sequence = 0;
  docs.items = [];
  docs.backlinks = [];
  docs.lastBody = null;
  docs.lastUrl = "";
  docs.uploads = [];
  const template: DocumentTemplate = {
    id: nextId(),
    name_fr: "Compte rendu de réunion",
    name_en: "Meeting notes",
    content_md: "# Réunion\n\n## Décisions\n",
  };
  docs.templates = [template];
  const root = addDocument({ title: "Architecture Horizon", content_md: "# Horizon" });
  const child = addDocument({ title: "Flux de paiement", parent_id: root.id });
  docs.searchable = [
    { type: "mission", id: missionIds.current, label: "Horizon — Paiements" },
    { type: "document", id: root.id, label: "Architecture Horizon" },
  ];
  Object.assign(docIds, { root: root.id, child: child.id, template: template.id });
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

const detail = (document: StoredDocument): DocumentDetail => {
  const { versions, ...rest } = document;
  return { ...rest, version_count: versions.length, has_draft: document.draft_md !== null };
};

function find(id: unknown) {
  return docs.items.find((d) => d.id === id);
}

function save(document: StoredDocument, title: string, content: string) {
  if (title !== document.title || content !== document.content_md) {
    document.versions.unshift({
      number: document.versions.length + 1,
      title,
      content_md: content,
      created_at: NOW,
    });
  }
  Object.assign(document, { title, content_md: content, draft_md: null, draft_saved_at: null });
}

export const documentsHandlers = [
  http.get("*/api/v1/documents", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase();
    const entity = url.searchParams.get("entity_id");
    const archived = url.searchParams.get("include_archived") === "true";
    const projectId = url.searchParams.get("project_id");
    const missionId = url.searchParams.get("mission_id");
    const unfiled = url.searchParams.get("unfiled") === "true";
    const missionProjects = projects.items
      .filter((p) => p.mission_id === missionId)
      .map((p) => p.id);
    return HttpResponse.json(
      docs.items
        .filter((d) => !projectId || d.project_id === projectId)
        .filter((d) => !missionId || (d.project_id && missionProjects.includes(d.project_id)))
        .filter((d) => !unfiled || !d.project_id)
        .filter((d) => !q || d.title.toLowerCase().includes(q))
        .filter((d) => !entity || d.entities.some((e) => e.id === entity))
        .filter((d) => archived || !d.archived_at)
        .map(detail),
    );
  }),
  http.post("*/api/v1/documents", async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      parent_id: string | null;
      project_id?: string | null;
      template_id: string | null;
      content_md: string;
      attach_to: { type: EntityRef["type"]; id: string } | null;
    };
    docs.lastBody = body;
    const template = docs.templates.find((t) => t.id === body.template_id);
    const created = addDocument({
      title: body.title,
      parent_id: body.parent_id,
      // A sub-page takes its parent's project (ADR-0042).
      project_id: body.parent_id
        ? (find(body.parent_id)?.project_id ?? null)
        : (body.project_id ?? null),
      content_md: body.content_md || template?.content_md || "",
      entities: body.attach_to ? [{ ...body.attach_to, label: "Horizon — Paiements" }] : [],
    });
    return HttpResponse.json(detail(created), { status: 201 });
  }),
  http.get("*/api/v1/documents/:id", ({ params }) => {
    const document = find(params.id);
    return document ? HttpResponse.json(detail(document)) : error(404, "NOT_FOUND");
  }),
  http.put("*/api/v1/documents/:id", async ({ params, request }) => {
    const body = (await request.json()) as { title: string; content_md: string };
    docs.lastBody = body;
    const document = find(params.id)!;
    save(document, body.title, body.content_md);
    return HttpResponse.json(detail(document));
  }),
  http.put("*/api/v1/documents/:id/draft", async ({ params, request }) => {
    const body = (await request.json()) as { content_md: string };
    docs.lastBody = body;
    docs.lastUrl = "draft";
    const document = find(params.id)!;
    Object.assign(document, { draft_md: body.content_md, draft_saved_at: NOW });
    return HttpResponse.json(detail(document));
  }),
  http.delete("*/api/v1/documents/:id/draft", ({ params }) => {
    const document = find(params.id)!;
    docs.lastUrl = "discard";
    Object.assign(document, { draft_md: null, draft_saved_at: null });
    return HttpResponse.json(detail(document));
  }),
  http.post("*/api/v1/documents/:id/move", async ({ params, request }) => {
    const body = (await request.json()) as { parent_id: string | null; project_id?: string | null };
    docs.lastBody = body;
    const document = find(params.id)!;
    document.parent_id = body.parent_id;
    const project = body.parent_id
      ? (find(body.parent_id)?.project_id ?? null)
      : "project_id" in body
        ? (body.project_id ?? null)
        : document.project_id;
    const subtree = new Set([document.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const d of docs.items) {
        if (d.parent_id && subtree.has(d.parent_id) && !subtree.has(d.id)) {
          subtree.add(d.id);
          grew = true;
        }
      }
    }
    for (const d of docs.items) if (subtree.has(d.id)) d.project_id = project;
    return HttpResponse.json(detail(document));
  }),
  http.post("*/api/v1/documents/:id/:action", ({ params }) => {
    const document = find(params.id)!;
    docs.lastUrl = String(params.action);
    document.archived_at = params.action === "archive" ? NOW : null;
    return HttpResponse.json(detail(document));
  }),
  http.delete("*/api/v1/documents/:id", ({ params }) => {
    if (docs.items.some((d) => d.parent_id === params.id)) {
      return error(409, "ENTITY_REFERENCED", { entity: "document", referencedBy: "document" });
    }
    docs.items = docs.items.filter((d) => d.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/documents/:id/versions", ({ params }) =>
    HttpResponse.json(
      find(params.id)!.versions.map(({ number, title, created_at }) => ({
        number,
        title,
        created_at,
      })),
    ),
  ),
  http.get("*/api/v1/documents/:id/versions/:number", ({ params }) =>
    HttpResponse.json(find(params.id)!.versions.find((v) => v.number === Number(params.number))),
  ),
  http.post("*/api/v1/documents/:id/versions/:number/restore", ({ params }) => {
    const document = find(params.id)!;
    const version = document.versions.find((v) => v.number === Number(params.number))!;
    save(document, version.title, version.content_md);
    return HttpResponse.json(detail(document));
  }),
  http.put("*/api/v1/documents/:id/entities/:type/:entityId", ({ params }) => {
    const document = find(params.id)!;
    docs.lastUrl = `attach:${String(params.type)}:${String(params.entityId)}`;
    const known = docs.searchable.find((s) => s.id === params.entityId);
    document.entities.push({
      type: params.type as EntityRef["type"],
      id: String(params.entityId),
      label: known?.label ?? null,
    });
    return HttpResponse.json(detail(document));
  }),
  http.delete("*/api/v1/documents/:id/entities/:type/:entityId", ({ params }) => {
    const document = find(params.id)!;
    docs.lastUrl = `detach:${String(params.type)}:${String(params.entityId)}`;
    document.entities = document.entities.filter((e) => e.id !== params.entityId);
    return HttpResponse.json(detail(document));
  }),
  http.get("*/api/v1/links/search", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const types = url.searchParams.getAll("types");
    return HttpResponse.json(
      docs.searchable.filter(
        (s) => s.label.toLowerCase().includes(q) && (!types.length || types.includes(s.type)),
      ),
    );
  }),
  http.get("*/api/v1/links/graph", () =>
    HttpResponse.json({
      nodes: docs.items.map((d) => ({ type: "document", id: d.id, label: d.title })),
      edges: docs.items
        .filter((d) => d.parent_id)
        .map((d) => ({
          source_type: "document",
          source_id: d.id,
          target_type: "document",
          target_id: d.parent_id,
          kind: "LINK",
        })),
    }),
  ),
  http.get("*/api/v1/backlinks", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(
      docs.backlinks
        .filter(
          (b) => b.type === url.searchParams.get("type") && b.id === url.searchParams.get("id"),
        )
        .map((b) => ({ document: detail(find(b.documentId)!), label: b.label })),
    );
  }),
  http.post("*/api/v1/attachments", async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file") as File;
    if (file.name.endsWith(".exe"))
      return error(415, "FILE_TYPE_NOT_ALLOWED", { extension: "exe" });
    const id = nextId();
    docs.uploads.push({ id, name: file.name });
    return HttpResponse.json(
      {
        id,
        document_id: form.get("document_id"),
        filename: file.name,
        mime_type: file.type,
        size: file.size,
        created_at: NOW,
      },
      { status: 201 },
    );
  }),
  http.get("*/api/v1/document-templates", () => HttpResponse.json(docs.templates)),
  http.post("*/api/v1/document-templates", async ({ request }) => {
    const body = (await request.json()) as Omit<DocumentTemplate, "id">;
    docs.lastBody = body;
    const created = { id: nextId(), ...body };
    docs.templates.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/document-templates/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<DocumentTemplate>;
    docs.lastBody = body;
    const found = docs.templates.find((t) => t.id === params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete("*/api/v1/document-templates/:id", ({ params }) => {
    docs.templates = docs.templates.filter((t) => t.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/subjects/:id", ({ params }) =>
    params.id === "subject-1"
      ? HttpResponse.json({ id: "subject-1", scope: "TRAINING", mission_id: null })
      : error(404, "NOT_FOUND"),
  ),
];
