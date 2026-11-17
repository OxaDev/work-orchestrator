/** TanStack Query hooks for documents, files, links and templates (P7, ADR-0036). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";
import type { LinkType } from "../../components/markdown";

type S = components["schemas"];
export type DocumentSummary = S["DocumentSummary"];
export type DocumentDetail = S["DocumentDetail"];
export type EntityRef = S["EntityRef"];
export type VersionSummary = S["VersionSummary"];
export type Backlink = S["Backlink"];
export type LinkSearchResult = S["LinkSearchResult"];
export type Attachment = S["AttachmentRead"];
export type DocumentTemplate = S["TemplateRead"];

export const documentKeys = {
  all: ["documents"] as const,
  list: (query: object) => ["documents", "list", query] as const,
  one: (id: string) => ["documents", id] as const,
  versions: (id: string) => ["documents", id, "versions"] as const,
  version: (id: string, number: number) => ["documents", id, "versions", number] as const,
  backlinks: (type: string, id: string) => ["documents", "backlinks", type, id] as const,
  templates: ["document-templates"] as const,
};

export function useDocuments(
  query: {
    q?: string;
    entity_type?: LinkType;
    entity_id?: string;
    include_archived?: boolean;
    /** ADR-0042: one project, the projects of a mission, or no project. */
    project_id?: string;
    mission_id?: string;
    unfiled?: boolean;
  } = {},
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: documentKeys.list(query),
    queryFn: () => unwrap(api.GET("/api/v1/documents", { params: { query } })),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: documentKeys.one(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/documents/{document_id}", { params: { path: { document_id: id } } })),
  });
}

function useInvalidateDocuments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: documentKeys.all });
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (body: S["DocumentCreate"]) => unwrap(api.POST("/api/v1/documents", { body })),
    onSuccess: invalidate,
  });
}

const path = (id: string) => ({ params: { path: { document_id: id } } });

export function useSaveDocument(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (body: S["DocumentSave"]) =>
      unwrap(api.PUT("/api/v1/documents/{document_id}", { ...path(id), body })),
    onSuccess: invalidate,
  });
}

/** Autosave (ADR-0024): no version; only this document's cache is refreshed. */
export function useSaveDraft(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string | null) =>
      content === null
        ? unwrap(api.DELETE("/api/v1/documents/{document_id}/draft", path(id)))
        : unwrap(
            api.PUT("/api/v1/documents/{document_id}/draft", {
              ...path(id),
              body: { content_md: content },
            }),
          ),
    onSuccess: (document) => queryClient.setQueryData(documentKeys.one(id), document),
  });
}

export function useMoveDocument(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (parentId: string | null) =>
      unwrap(
        api.POST("/api/v1/documents/{document_id}/move", {
          ...path(id),
          body: { parent_id: parentId },
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Drag and drop in the tree (ADR-0042): under a page, or at the top level of a project
 * (`projectId` undefined keeps the current one, null unfiles). */
export function useRelocateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({
      id,
      parentId,
      projectId,
    }: {
      id: string;
      parentId: string | null;
      projectId?: string | null;
    }) =>
      unwrap(
        api.POST("/api/v1/documents/{document_id}/move", {
          ...path(id),
          body:
            projectId === undefined
              ? { parent_id: parentId }
              : { parent_id: parentId, project_id: projectId },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useArchiveDocument(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (archived: boolean) =>
      archived
        ? unwrap(api.POST("/api/v1/documents/{document_id}/archive", path(id)))
        : unwrap(api.POST("/api/v1/documents/{document_id}/restore", path(id))),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/documents/{document_id}", path(id))),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: documentKeys.one(id) });
      return queryClient.invalidateQueries({ queryKey: documentKeys.all });
    },
  });
}

export function useVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.versions(id),
    queryFn: () => unwrap(api.GET("/api/v1/documents/{document_id}/versions", path(id))),
    enabled,
  });
}

export function useVersion(id: string, number: number | null) {
  return useQuery({
    queryKey: documentKeys.version(id, number ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/documents/{document_id}/versions/{number}", {
          params: { path: { document_id: id, number: number! } },
        }),
      ),
    enabled: number !== null,
  });
}

export function useRestoreVersion(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (number: number) =>
      unwrap(
        api.POST("/api/v1/documents/{document_id}/versions/{number}/restore", {
          params: { path: { document_id: id, number } },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useAttachEntity(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({
      type,
      entityId,
      attach,
    }: {
      type: LinkType;
      entityId: string;
      attach: boolean;
    }) => {
      const params = {
        params: { path: { document_id: id, entity_type: type, entity_id: entityId } },
      };
      return attach
        ? unwrap(
            api.PUT("/api/v1/documents/{document_id}/entities/{entity_type}/{entity_id}", params),
          )
        : unwrap(
            api.DELETE(
              "/api/v1/documents/{document_id}/entities/{entity_type}/{entity_id}",
              params,
            ),
          );
    },
    onSuccess: invalidate,
  });
}

export function useBacklinks(type: LinkType, id: string) {
  return useQuery({
    queryKey: documentKeys.backlinks(type, id),
    queryFn: () => unwrap(api.GET("/api/v1/backlinks", { params: { query: { type, id } } })),
  });
}

/** Entities matching a text, for the `[[` completion and entity pickers (P7-9). */
export function searchLinks(q: string, types?: LinkType[]): Promise<LinkSearchResult[]> {
  return unwrap(api.GET("/api/v1/links/search", { params: { query: { q, types, limit: 20 } } }));
}

/** Title of a document, to turn a pasted document URL into a wikilink (ADR-0043). */
export async function getDocumentTitle(id: string): Promise<string> {
  const document = await unwrap(
    api.GET("/api/v1/documents/{document_id}", { params: { path: { document_id: id } } }),
  );
  return document.title;
}

/** Uploads a file (ADR-0027); returns its id for an `attachment:<id>` reference. */
export function uploadAttachment(file: File, documentId?: string): Promise<Attachment> {
  return unwrap(
    api.POST("/api/v1/attachments", {
      body: { file: file as unknown as string, document_id: documentId ?? null },
      bodySerializer: (body) => {
        const form = new FormData();
        form.append("file", body.file as unknown as Blob, file.name);
        if (body.document_id) form.append("document_id", body.document_id);
        return form;
      },
    }),
  );
}

// --- templates -------------------------------------------------------------------------------

export function useDocumentTemplates() {
  return useQuery({
    queryKey: documentKeys.templates,
    queryFn: () => unwrap(api.GET("/api/v1/document-templates")),
    staleTime: 5 * 60_000,
  });
}

export function useSaveDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name_fr: string;
      name_en: string;
      content_md: string;
    }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/document-templates/{template_id}", {
              params: { path: { template_id: id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/document-templates", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.templates }),
  });
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/document-templates/{template_id}", {
          params: { path: { template_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.templates }),
  });
}

export type KnowledgeGraph = S["KnowledgeGraph"];

/** Documents and the entities they link to or are attached to (P9-12). */
export function useKnowledgeGraph() {
  return useQuery({
    queryKey: [...documentKeys.all, "knowledge-graph"],
    queryFn: () => unwrap(api.GET("/api/v1/links/graph")),
  });
}
