/** TanStack Query hooks for the agenda micro view (P5): tasks, daily logs, standup. */

import { notifications } from "@mantine/notifications";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { subjectKeys } from "../subjects/api";
import { formatDuration } from "./duration";

type S = components["schemas"];
export type Task = S["TaskRead"];
export type TaskKind = S["TaskKind"];
export type TaskStatus = S["TaskStatus"];
export type TaskCreate = S["TaskCreate"];
export type TaskUpdate = S["TaskUpdate"];
export type TaskWriteResult = S["TaskWriteResult"];
export type CompatibilityRule = S["CompatibilityRule"];
export type DailyLog = S["DailyLogRead"];
export type DailyLogWrite = S["DailyLogWrite"];
export type Standup = S["Standup"];

export const TASK_STATUSES: TaskStatus[] = ["PLANNED", "DONE", "CANCELLED", "CARRIED_OVER"];
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  PLANNED: "blue",
  DONE: "teal",
  CANCELLED: "gray",
  CARRIED_OVER: "orange",
};

const keys = {
  tasks: (from: string, to: string) => ["agenda", "tasks", from, to] as const,
  dailyLog: (day: string) => ["agenda", "daily-log", day] as const,
  standup: (day: string) => ["agenda", "standup", day] as const,
  compatibility: ["agenda-compatibility"] as const,
};

export function useTasks(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.tasks(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/agenda/tasks", { params: { query: { from, to } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** ADR-0020 matrix served by the backend: the UI never duplicates it. */
export function useCompatibility() {
  return useQuery({
    queryKey: keys.compatibility,
    queryFn: () => unwrap(api.GET("/api/v1/agenda/compatibility")),
    staleTime: Infinity,
  });
}

/**
 * After any task write: refresh the agenda (a task may fill an empty half-day, ADR-0034) and
 * subject counters, then show RG-06 warnings.
 */
function useAfterTaskWrite() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("agenda");
  return async (result?: TaskWriteResult | void) => {
    for (const warning of result?.warnings ?? []) {
      const params = warning.params as { totalMinutes: number; maxMinutes: number };
      notifications.show({
        color: "orange",
        message: t(`warnings.${warning.code}`, {
          total: formatDuration(params.totalMinutes),
          max: formatDuration(params.maxMinutes),
        }),
      });
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agenda"] }),
      queryClient.invalidateQueries({ queryKey: subjectKeys.all }),
    ]);
  };
}

/** Error toast shared by task mutations. */
export function useTaskError() {
  const errorMessage = useErrorMessage();
  return (error: unknown) => notifications.show({ color: "red", message: errorMessage(error) });
}

export function useCreateTask() {
  const after = useAfterTaskWrite();
  return useMutation({
    mutationFn: (body: TaskCreate) => unwrap(api.POST("/api/v1/agenda/tasks", { body })),
    onSuccess: after,
  });
}

export function useUpdateTask() {
  const after = useAfterTaskWrite();
  return useMutation({
    mutationFn: ({ id, ...body }: TaskUpdate & { id: string }) =>
      unwrap(
        api.PATCH("/api/v1/agenda/tasks/{task_id}", { params: { path: { task_id: id } }, body }),
      ),
    onSuccess: after,
  });
}

export function useDeleteTask() {
  const after = useAfterTaskWrite();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/agenda/tasks/{task_id}", { params: { path: { task_id: id } } })),
    onSuccess: () => after(),
  });
}

export function useCarryOver() {
  const after = useAfterTaskWrite();
  return useMutation({
    mutationFn: ({ id, notBefore }: { id: string; notBefore?: string }) =>
      unwrap(
        api.POST("/api/v1/agenda/tasks/{task_id}/carry-over", {
          params: { path: { task_id: id } },
          body: { target: null, not_before: notBefore ?? null },
        }),
      ),
    onSuccess: after,
  });
}

export function useDailyLog(day: string) {
  return useQuery({
    queryKey: keys.dailyLog(day),
    queryFn: () =>
      unwrap(api.GET("/api/v1/agenda/daily-logs/{day}", { params: { path: { day } } })),
  });
}

export function useSaveDailyLog(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DailyLogWrite) =>
      unwrap(api.PUT("/api/v1/agenda/daily-logs/{day}", { params: { path: { day } }, body })),
    onSuccess: (log) => {
      queryClient.setQueryData(keys.dailyLog(day), log);
      return queryClient.invalidateQueries({ queryKey: keys.standup(day) });
    },
  });
}

export function useStandup(day: string) {
  return useQuery({
    queryKey: keys.standup(day),
    queryFn: () => unwrap(api.GET("/api/v1/agenda/standup", { params: { query: { date: day } } })),
  });
}
