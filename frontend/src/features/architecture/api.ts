/** TanStack Query hooks for architectures, domains, relations and external links (P8). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type ArchitectureSummary = S["ArchitectureSummary"];
export type ArchitectureDetail = S["ArchitectureDetail"];
export type DomainSummary = S["DomainSummary"];
export type DomainDetail = S["DomainDetail"];
export type DomainKind = S["DomainKind"];
export type Lifecycle = S["Lifecycle"];
export type Criticality = S["Criticality"];
export type RelationType = S["RelationType"];
export type SyncMode = S["SyncMode"];
export type Relation = S["RelationRead"];
export type RelationCreate = S["RelationCreate"];
export type DomainCreate = S["DomainCreate"];
export type DomainUpdate = S["DomainUpdate"];
export type ExternalLink = S["ExternalLinkRead"];
export type ExternalLinkKind = S["ExternalLinkKind"];
export type LinkedEntity = S["LinkedEntity"];
export type Graph = S["Graph"];

export const DOMAIN_KINDS: DomainKind[] = [
  "BUSINESS_DOMAIN",
  "APPLICATION",
  "SERVICE",
  "DATABASE",
  "MESSAGING",
  "EXTERNAL_SYSTEM",
  "INFRASTRUCTURE",
  "OTHER",
];
export const LIFECYCLES: Lifecycle[] = ["CURRENT", "TARGET", "DEPRECATED"];
export const CRITICALITIES: Criticality[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const RELATION_TYPES: RelationType[] = [
  "CALLS",
  "DEPENDS_ON",
  "PUBLISHES_TO",
  "SUBSCRIBES_TO",
  "READS_FROM",
  "WRITES_TO",
  "CUSTOM",
];
export const LINK_KINDS: ExternalLinkKind[] = [
  "REPOSITORY",
  "TICKETS",
  "ENVIRONMENT",
  "DOCUMENTATION",
  "MONITORING",
  "OTHER",
];
export const PROTOCOLS = [
  "REST",
  "gRPC",
  "GraphQL",
  "SOAP",
  "Kafka",
  "AMQP",
  "JDBC",
  "SQL",
  "SFTP",
  "OIDC",
  "CDC",
];

export const keys = {
  all: ["architecture"] as const,
  architectures: (query: object) => ["architecture", "architectures", query] as const,
  architecture: (id: string) => ["architecture", "architecture", id] as const,
  graph: (id: string) => ["architecture", "graph", id] as const,
  domains: (query: object) => ["architecture", "domains", query] as const,
  domain: (id: string) => ["architecture", "domain", id] as const,
  tasks: (id: string) => ["architecture", "domain-tasks", id] as const,
};

/** Every write can change trees, counts and graphs: refresh the whole module. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

// --- architectures ---------------------------------------------------------------------------

export function useArchitectures(
  query: { company_id?: string; mission_id?: string; include_archived?: boolean } = {},
) {
  return useQuery({
    queryKey: keys.architectures(query),
    queryFn: () => unwrap(api.GET("/api/v1/architectures", { params: { query } })),
  });
}

export function useArchitecture(id: string) {
  return useQuery({
    queryKey: keys.architecture(id),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/architectures/{architecture_id}", {
          params: { path: { architecture_id: id } },
        }),
      ),
  });
}

export function useGraph(id: string) {
  return useQuery({
    queryKey: keys.graph(id),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/architectures/{architecture_id}/graph", {
          params: { path: { architecture_id: id } },
        }),
      ),
  });
}

export function useCreateArchitecture() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: S["ArchitectureCreate"]) =>
      unwrap(api.POST("/api/v1/architectures", { body })),
    onSuccess: invalidate,
  });
}

const archPath = (id: string) => ({ params: { path: { architecture_id: id } } });

export function useUpdateArchitecture(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: S["ArchitectureUpdate"]) =>
      unwrap(api.PATCH("/api/v1/architectures/{architecture_id}", { ...archPath(id), body })),
    onSuccess: invalidate,
  });
}

export function useArchiveArchitecture(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (archived: boolean) =>
      archived
        ? unwrap(api.POST("/api/v1/architectures/{architecture_id}/archive", archPath(id)))
        : unwrap(api.POST("/api/v1/architectures/{architecture_id}/restore", archPath(id))),
    onSuccess: invalidate,
  });
}

export function useDeleteArchitecture(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/architectures/{architecture_id}", archPath(id))),
    onSuccess: invalidate,
  });
}

export function useMember(architectureId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ domainId, member }: { domainId: string; member: boolean }) => {
      const params = { params: { path: { architecture_id: architectureId, domain_id: domainId } } };
      return member
        ? unwrap(api.PUT("/api/v1/architectures/{architecture_id}/domains/{domain_id}", params))
        : unwrap(api.DELETE("/api/v1/architectures/{architecture_id}/domains/{domain_id}", params));
    },
    onSuccess: invalidate,
  });
}

export function useMissionLink() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      architectureId,
      missionId,
      linked,
    }: {
      architectureId: string;
      missionId: string;
      linked: boolean;
    }) => {
      const params = {
        params: { path: { architecture_id: architectureId, mission_id: missionId } },
      };
      return linked
        ? unwrap(api.PUT("/api/v1/architectures/{architecture_id}/missions/{mission_id}", params))
        : unwrap(
            api.DELETE("/api/v1/architectures/{architecture_id}/missions/{mission_id}", params),
          );
    },
    onSuccess: invalidate,
  });
}

// --- domains ---------------------------------------------------------------------------------

export function useDomains(
  query: { company_id?: string; q?: string; include_archived?: boolean },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.domains(query),
    queryFn: () => unwrap(api.GET("/api/v1/domains", { params: { query } })),
    enabled,
  });
}

export function useDomain(id: string) {
  return useQuery({
    queryKey: keys.domain(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/domains/{domain_id}", { params: { path: { domain_id: id } } })),
  });
}

export function useDomainTasks(id: string) {
  return useQuery({
    queryKey: keys.tasks(id),
    queryFn: () =>
      unwrap(api.GET("/api/v1/domains/{domain_id}/tasks", { params: { path: { domain_id: id } } })),
  });
}

export function useCreateDomain() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: DomainCreate) => unwrap(api.POST("/api/v1/domains", { body })),
    onSuccess: invalidate,
  });
}

const domainPath = (id: string) => ({ params: { path: { domain_id: id } } });

export function useUpdateDomain(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: DomainUpdate) =>
      unwrap(api.PATCH("/api/v1/domains/{domain_id}", { ...domainPath(id), body })),
    onSuccess: invalidate,
  });
}

export function useArchiveDomain(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (archived: boolean) =>
      archived
        ? unwrap(api.POST("/api/v1/domains/{domain_id}/archive", domainPath(id)))
        : unwrap(api.POST("/api/v1/domains/{domain_id}/restore", domainPath(id))),
    onSuccess: invalidate,
  });
}

export function useDeleteDomain(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/domains/{domain_id}", domainPath(id))),
    onSuccess: invalidate,
  });
}

export function useDomainTechnology(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      technologyId,
      version,
      remove,
    }: {
      technologyId: string;
      version?: string | null;
      remove?: boolean;
    }) => {
      const params = { params: { path: { domain_id: id, technology_id: technologyId } } };
      return remove
        ? unwrap(api.DELETE("/api/v1/domains/{domain_id}/technologies/{technology_id}", params))
        : unwrap(
            api.PUT("/api/v1/domains/{domain_id}/technologies/{technology_id}", {
              ...params,
              body: { version: version ?? null },
            }),
          );
    },
    onSuccess: invalidate,
  });
}

export function useDomainSubject(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ subjectId, linked }: { subjectId: string; linked: boolean }) => {
      const params = { params: { path: { domain_id: id, subject_id: subjectId } } };
      return linked
        ? unwrap(api.PUT("/api/v1/domains/{domain_id}/subjects/{subject_id}", params))
        : unwrap(api.DELETE("/api/v1/domains/{domain_id}/subjects/{subject_id}", params));
    },
    onSuccess: invalidate,
  });
}

// --- relations and external links ------------------------------------------------------------

export function useSaveRelation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: RelationCreate & { id?: string }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/domain-relations/{relation_id}", {
              params: { path: { relation_id: id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/domain-relations", { body })),
    onSuccess: invalidate,
  });
}

export function useDeleteRelation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/domain-relations/{relation_id}", {
          params: { path: { relation_id: id } },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useExternalLinks(entityType: LinkedEntity, entityId: string) {
  return useQuery({
    queryKey: ["architecture", "links", entityType, entityId],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/external-links", {
          params: { query: { entity_type: entityType, entity_id: entityId } },
        }),
      ),
  });
}

export function useSaveExternalLink() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: S["ExternalLinkCreate"]) =>
      unwrap(api.POST("/api/v1/external-links", { body })),
    onSuccess: invalidate,
  });
}

export function useDeleteExternalLink() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/external-links/{link_id}", { params: { path: { link_id: id } } })),
    onSuccess: invalidate,
  });
}

// --- graph view and export (P9, ADR-0038) ----------------------------------------------------

export type MermaidFormat = S["MermaidFormat"];
export type NodePosition = S["NodePosition"];

export interface MermaidOptions {
  format: MermaidFormat;
  direction: "LR" | "TB";
  view: "CURRENT" | "TARGET" | "BOTH";
  depth: number | null;
  lang: "fr" | "en";
}

export function useMermaid(id: string, options: MermaidOptions) {
  return useQuery({
    queryKey: ["architecture", "mermaid", id, options],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/architectures/{architecture_id}/mermaid", {
          params: {
            path: { architecture_id: id },
            query: {
              format: options.format,
              direction: options.direction,
              view: options.view,
              lang: options.lang,
              ...(options.depth === null ? {} : { depth: options.depth }),
            },
          },
        }),
      ),
  });
}

export function useLayout(id: string) {
  return useQuery({
    queryKey: ["architecture", "layout", id],
    queryFn: () => unwrap(api.GET("/api/v1/architectures/{architecture_id}/layout", archPath(id))),
  });
}

export function useSaveLayout(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (positions: NodePosition[]) =>
      unwrap(
        api.PUT("/api/v1/architectures/{architecture_id}/layout", {
          ...archPath(id),
          body: { positions },
        }),
      ),
    onSuccess: (layout) => queryClient.setQueryData(["architecture", "layout", id], layout),
  });
}

export function useResetLayout(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/v1/architectures/{architecture_id}/layout", archPath(id))),
    onSuccess: () => queryClient.setQueryData(["architecture", "layout", id], []),
  });
}
