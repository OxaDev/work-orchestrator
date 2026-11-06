/** TanStack Query hooks for week templates (P6, ADR-0035). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type WeekTemplate = S["WeekTemplateRead"];
export type TemplateSlot = S["TemplateSlot"];
export type TemplateApplication = S["TemplateApplication"];
export type ApplicationPlan = S["ApplicationPlan"];
export type PlanAction = S["PlanAction"];
export type ApplyStrategy = S["ApplyStrategy"];

/** Display order of plan actions; written ones first. */
export const PLAN_ACTIONS: PlanAction[] = [
  "CREATE",
  "OVERWRITE",
  "UNCHANGED",
  "KEEP",
  "BLOCKED_BY_TASKS",
  "OUTSIDE_MISSION",
  "LOCKED",
  "HOLIDAY",
];
export const ACTION_COLORS: Record<PlanAction, string> = {
  CREATE: "teal",
  OVERWRITE: "orange",
  UNCHANGED: "gray",
  KEEP: "blue",
  BLOCKED_BY_TASKS: "red",
  OUTSIDE_MISSION: "grape",
  LOCKED: "dark",
  HOLIDAY: "pink",
};

const keys = {
  all: ["week-templates"] as const,
  list: (missionId?: string) => ["week-templates", "list", missionId ?? null] as const,
  one: (id: string) => ["week-templates", id] as const,
};

export function useWeekTemplates(missionId?: string) {
  return useQuery({
    queryKey: keys.list(missionId),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/agenda/week-templates", {
          params: { query: missionId ? { mission_id: missionId } : {} },
        }),
      ),
  });
}

export function useWeekTemplate(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/agenda/week-templates/{template_id}", {
          params: { path: { template_id: id } },
        }),
      ),
  });
}

function useInvalidateTemplates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (body: S["WeekTemplateCreate"]) =>
      unwrap(api.POST("/api/v1/agenda/week-templates", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate(id: string) {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (body: S["WeekTemplateUpdate"]) =>
      unwrap(
        api.PATCH("/api/v1/agenda/week-templates/{template_id}", {
          params: { path: { template_id: id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDuplicateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(
        api.POST("/api/v1/agenda/week-templates/{template_id}/duplicate", {
          params: { path: { template_id: id } },
          body: { name },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/agenda/week-templates/{template_id}", {
          params: { path: { template_id: id } },
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Preview writes nothing: a mutation only because it is triggered on demand (P6-3). */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: ({ id, ...body }: TemplateApplication & { id: string }) =>
      unwrap(
        api.POST("/api/v1/agenda/week-templates/{template_id}/preview", {
          params: { path: { template_id: id } },
          body,
        }),
      ),
  });
}

export function useApplyTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TemplateApplication & { id: string }) =>
      unwrap(
        api.POST("/api/v1/agenda/week-templates/{template_id}/apply", {
          params: { path: { template_id: id } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agenda"] }),
  });
}
