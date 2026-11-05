/** TanStack Query hooks for the agenda (P4). */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type HalfDay = S["HalfDayRead"];
export type HalfDayKind = S["HalfDayKind"];
export type Period = S["Period"];
export type WorkLocation = S["WorkLocation"];
export type Slot = S["Slot"];
export type HalfDayValues = S["HalfDayValues"];
export type Subtype = S["SubtypeWithUsage"];
export type MonthStatus = S["MonthStatus"];
export type Stats = S["Stats"];

const keys = {
  all: ["agenda"] as const,
  halfDays: (from: string, to: string) => ["agenda", "half-days", from, to] as const,
  holidays: (year: number) => ["agenda", "holidays", year] as const,
  stats: (from: string, to: string) => ["agenda", "stats", from, to] as const,
  months: (year: number) => ["agenda", "months", year] as const,
  month: (year: number, month: number) => ["agenda", "month", year, month] as const,
  unfilled: ["agenda", "unfilled"] as const,
  subtypes: ["agenda-subtypes"] as const,
};

/** Any agenda write can change counts, locks and statistics: refresh the whole agenda. */
function useInvalidateAgenda() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useHalfDays(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.halfDays(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/agenda/half-days", { params: { query: { from, to } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAssign() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (body: HalfDayValues & { slots: Slot[] }) =>
      unwrap(api.POST("/api/v1/agenda/half-days/bulk", { body })),
    onSuccess: invalidate,
  });
}

export function useClear() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (slots: Slot[]) =>
      unwrap(api.POST("/api/v1/agenda/half-days/bulk-delete", { body: { slots } })),
    onSuccess: invalidate,
  });
}

export function usePublicHolidays(year: number) {
  return useQuery({
    queryKey: keys.holidays(year),
    queryFn: () =>
      unwrap(api.GET("/api/v1/agenda/public-holidays", { params: { query: { year } } })),
    staleTime: Infinity,
  });
}

/**
 * Pre-fills the year's public holidays (RG-11). Idempotent on the server, so it is modelled as
 * a query; the agenda queries wait for it (`enabled`), otherwise a first load started in
 * parallel would show the year without its holidays.
 */
export function useHolidayGeneration(year: number) {
  const generation = useQuery({
    queryKey: ["agenda-holidays-generated", year],
    queryFn: () =>
      unwrap(api.POST("/api/v1/agenda/public-holidays/generate", { params: { query: { year } } })),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return { ready: !generation.isPending };
}

export function useStats(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.stats(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/agenda/stats", { params: { query: { from, to } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUnfilled() {
  return useQuery({
    queryKey: keys.unfilled,
    queryFn: () => unwrap(api.GET("/api/v1/agenda/unfilled")),
  });
}

export function useYearLocks(year: number) {
  return useQuery({
    queryKey: keys.months(year),
    queryFn: () => unwrap(api.GET("/api/v1/agenda/months", { params: { query: { year } } })),
  });
}

export function useMonthStatus(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: keys.month(year, month),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/agenda/months/{year}/{month}", { params: { path: { year, month } } }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useLockMonth(year: number, month: number) {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (note: string | null) =>
      unwrap(
        api.POST("/api/v1/agenda/months/{year}/{month}/lock", {
          params: { path: { year, month } },
          body: { note },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useUnlockMonth(year: number, month: number) {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/api/v1/agenda/months/{year}/{month}/unlock", {
          params: { path: { year, month } },
          body: { reason },
        }),
      ),
    onSuccess: invalidate,
  });
}

// --- subtypes --------------------------------------------------------------------------------

export function useSubtypes() {
  return useQuery({
    queryKey: keys.subtypes,
    queryFn: () => unwrap(api.GET("/api/v1/agenda/subtypes")),
    staleTime: 5 * 60_000,
  });
}

export function useSaveSubtype() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      kind: HalfDayKind;
      name_fr: string;
      name_en: string;
    }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/agenda/subtypes/{subtype_id}", {
              params: { path: { subtype_id: id } },
              body: { name_fr: body.name_fr, name_en: body.name_en },
            }),
          )
        : unwrap(api.POST("/api/v1/agenda/subtypes", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.subtypes }),
  });
}

export function useDeleteSubtype() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/agenda/subtypes/{subtype_id}", {
          params: { path: { subtype_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.subtypes }),
  });
}
