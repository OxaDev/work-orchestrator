/** TanStack Query hooks for projects (ADR-0042). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type ProjectSummary = S["ProjectSummary"];
export type ProjectCreate = S["ProjectCreate"];
export type ProjectUpdate = S["ProjectUpdate"];

export const projectKeys = {
  all: ["projects"] as const,
  list: (query: object) => ["projects", "list", query] as const,
  one: (id: string) => ["projects", id] as const,
};

export function useProjects(
  query: { mission_id?: string; include_archived?: boolean } = {},
  enabled = true,
  silent = false,
) {
  return useQuery({
    enabled,
    meta: silent ? { inlineError: true } : undefined,
    queryKey: projectKeys.list(query),
    // One page is plenty: a mission has a handful of projects.
    queryFn: () =>
      unwrap(api.GET("/api/v1/projects", { params: { query: { ...query, limit: 200 } } })),
  });
}

/** Missions offered by the context switcher. Silent on failure: the page in view reports its
 * own errors, the navbar must not add a second toast. */
export function useMissionChoices() {
  return useQuery({
    queryKey: ["missions", "choices"],
    meta: { inlineError: true },
    queryFn: () => unwrap(api.GET("/api/v1/missions", { params: { query: { limit: 200 } } })),
  });
}

export function useProject(id: string | null | undefined) {
  return useQuery({
    enabled: Boolean(id),
    queryKey: projectKeys.one(id ?? ""),
    meta: { inlineError: true },
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/projects/{project_id}", { params: { path: { project_id: id ?? "" } } }),
      ),
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectKeys.all });
}

const path = (id: string) => ({ params: { path: { project_id: id } } });

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body: ProjectCreate) => unwrap(api.POST("/api/v1/projects", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body: ProjectUpdate) =>
      unwrap(api.PATCH("/api/v1/projects/{project_id}", { ...path(id), body })),
    onSuccess: invalidate,
  });
}

export function useArchiveProject(id: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? api.POST("/api/v1/projects/{project_id}/archive", path(id))
          : api.POST("/api/v1/projects/{project_id}/restore", path(id)),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/projects/{project_id}", path(id))),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.one(id) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.list({}).slice(0, 2) });
    },
  });
}

export const projectPath = (project: { id: string; mission: { id: string } }, tab?: string) =>
  `/missions/${project.mission.id}/projects/${project.id}${tab ? `/${tab}` : ""}`;
