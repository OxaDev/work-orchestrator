/** TanStack Query hooks for subjects and their categories (P5-1 to P5-3, ADR-0034). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components, operations } from "../../api/schema";

type S = components["schemas"];
export type Subject = S["SubjectRead"];
export type SubjectScope = S["SubjectScope"];
export type SubjectStatus = S["SubjectStatus"];
export type SubjectCreate = S["SubjectCreate"];
export type SubjectUpdate = S["SubjectUpdate"];
export type Category = S["CategoryWithUsage"];
export type SubjectQuery = NonNullable<
  operations["list_subjects_api_v1_subjects_get"]["parameters"]["query"]
>;

export const SCOPES: SubjectScope[] = ["MISSION", "INTERCONTRACT", "TRAINING", "PERSONAL"];
export const SUBJECT_STATUSES: SubjectStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
export const SUBJECT_STATUS_COLORS: Record<SubjectStatus, string> = {
  OPEN: "blue",
  IN_PROGRESS: "orange",
  DONE: "teal",
  CANCELLED: "gray",
};

export const subjectKeys = {
  all: ["subjects"] as const,
  list: (query: SubjectQuery) => ["subjects", "list", query] as const,
  categories: ["subject-categories"] as const,
};

export function useSubjects(query: SubjectQuery = {}) {
  return useQuery({
    queryKey: subjectKeys.list(query),
    queryFn: () => unwrap(api.GET("/api/v1/subjects", { params: { query } })),
  });
}

function useInvalidateSubjects() {
  const queryClient = useQueryClient();
  // Task lists embed subject titles: refresh them as well.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: subjectKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["agenda"] }),
    ]);
}

export function useCreateSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({
    mutationFn: (body: SubjectCreate) => unwrap(api.POST("/api/v1/subjects", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({
    mutationFn: ({ id, ...body }: SubjectUpdate & { id: string }) =>
      unwrap(
        api.PATCH("/api/v1/subjects/{subject_id}", { params: { path: { subject_id: id } }, body }),
      ),
    onSuccess: invalidate,
  });
}

export function useArchiveSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived
        ? unwrap(
            api.POST("/api/v1/subjects/{subject_id}/archive", {
              params: { path: { subject_id: id } },
            }),
          )
        : unwrap(
            api.POST("/api/v1/subjects/{subject_id}/restore", {
              params: { path: { subject_id: id } },
            }),
          ),
    onSuccess: invalidate,
  });
}

export function useDeleteSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/subjects/{subject_id}", { params: { path: { subject_id: id } } })),
    onSuccess: invalidate,
  });
}

// --- categories ------------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: subjectKeys.categories,
    queryFn: () => unwrap(api.GET("/api/v1/subject-categories")),
    staleTime: 5 * 60_000,
  });
}

export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name_fr: string; name_en: string }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/subject-categories/{category_id}", {
              params: { path: { category_id: id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/subject-categories", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectKeys.categories }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/subject-categories/{category_id}", {
          params: { path: { category_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectKeys.categories }),
  });
}

/** "Parent › Child" labels, used by selects and task cards. */
export function subjectPaths(subjects: readonly Subject[]): Map<string, string> {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const paths = new Map<string, string>();
  const path = (subject: Subject, seen = new Set<string>()): string => {
    const cached = paths.get(subject.id);
    if (cached) return cached;
    const parent = subject.parent_id ? byId.get(subject.parent_id) : undefined;
    const value =
      parent && !seen.has(parent.id)
        ? `${path(parent, seen.add(subject.id))} › ${subject.title}`
        : subject.title;
    paths.set(subject.id, value);
    return value;
  };
  for (const subject of subjects) path(subject);
  return paths;
}
