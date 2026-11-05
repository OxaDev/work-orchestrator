/** TanStack Query hooks for missions and contact roles (P3). */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components, operations } from "../../api/schema";

type S = components["schemas"];
export type MissionSummary = S["MissionSummary"];
export type MissionDetail = S["MissionDetail"];
export type MissionStatus = S["MissionStatus"];
export type MissionCreate = S["MissionCreate"];
export type MissionUpdate = S["MissionUpdate"];
export type Role = S["RoleRead"];
export type RoleWithUsage = S["RoleWithUsage"];
export type MissionQuery = NonNullable<
  operations["list_missions_api_v1_missions_get"]["parameters"]["query"]
>;

export const MISSION_STATUSES: MissionStatus[] = ["PROSPECT", "ACTIVE", "ON_HOLD", "ENDED"];
export const MISSION_COLORS = [
  "blue",
  "teal",
  "grape",
  "orange",
  "cyan",
  "pink",
  "lime",
  "violet",
  "indigo",
  "green",
  "red",
  "yellow",
] as const;
export const STATUS_COLORS: Record<MissionStatus, string> = {
  PROSPECT: "blue",
  ACTIVE: "teal",
  ON_HOLD: "yellow",
  ENDED: "gray",
};

const keys = {
  missions: ["missions"] as const,
  mission: (id: string) => ["missions", id] as const,
  roles: ["contact-roles"] as const,
};

export function useMissions(query: MissionQuery = {}) {
  return useQuery({
    queryKey: [...keys.missions, "list", query],
    queryFn: () => unwrap(api.GET("/api/v1/missions", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useMission(id: string | undefined) {
  return useQuery({
    queryKey: keys.mission(id ?? ""),
    queryFn: () =>
      unwrap(api.GET("/api/v1/missions/{mission_id}", { params: { path: { mission_id: id! } } })),
    enabled: Boolean(id),
  });
}

/** Every mutation returns the fresh detail: store it and refresh the lists. */
function useMissionMutation<V>(fn: (vars: V) => Promise<MissionDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (mission) => {
      queryClient.setQueryData(keys.mission(mission.id), mission);
      void queryClient.invalidateQueries({ queryKey: [...keys.missions, "list"] });
      void queryClient.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

const path = (id: string) => ({ params: { path: { mission_id: id } } });

export function useCreateMission() {
  return useMissionMutation((body: MissionCreate) =>
    unwrap(api.POST("/api/v1/missions", { body })),
  );
}

export function useUpdateMission(id: string) {
  return useMissionMutation((body: MissionUpdate) =>
    unwrap(api.PATCH("/api/v1/missions/{mission_id}", { ...path(id), body })),
  );
}

export function useArchiveMission(id: string) {
  return useMissionMutation((archived: boolean) =>
    unwrap(
      archived
        ? api.POST("/api/v1/missions/{mission_id}/archive", path(id))
        : api.POST("/api/v1/missions/{mission_id}/restore", path(id)),
    ),
  );
}

export function useDeleteMission(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/missions/{mission_id}", path(id))),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.mission(id) });
      void queryClient.invalidateQueries({ queryKey: [...keys.missions, "list"] });
    },
  });
}

export function usePutMissionContact(id: string) {
  return useMissionMutation(
    ({ contactId, ...body }: { contactId: string; role_id: string | null; note?: string | null }) =>
      unwrap(
        api.PUT("/api/v1/missions/{mission_id}/contacts/{contact_id}", {
          params: { path: { mission_id: id, contact_id: contactId } },
          body,
        }),
      ),
  );
}

export function useDeleteMissionContact(id: string) {
  return useMissionMutation((contactId: string) =>
    unwrap(
      api.DELETE("/api/v1/missions/{mission_id}/contacts/{contact_id}", {
        params: { path: { mission_id: id, contact_id: contactId } },
      }),
    ),
  );
}

export function usePutMissionTechnology(id: string) {
  return useMissionMutation(
    ({
      technologyId,
      ...body
    }: {
      technologyId: string;
      weight: number;
      version?: string | null;
      note?: string | null;
    }) =>
      unwrap(
        api.PUT("/api/v1/missions/{mission_id}/technologies/{technology_id}", {
          params: { path: { mission_id: id, technology_id: technologyId } },
          body,
        }),
      ),
  );
}

export function useDeleteMissionTechnology(id: string) {
  return useMissionMutation((technologyId: string) =>
    unwrap(
      api.DELETE("/api/v1/missions/{mission_id}/technologies/{technology_id}", {
        params: { path: { mission_id: id, technology_id: technologyId } },
      }),
    ),
  );
}

// --- contact roles ---------------------------------------------------------------------------

export function useContactRoles() {
  return useQuery({
    queryKey: keys.roles,
    queryFn: () => unwrap(api.GET("/api/v1/contact-roles")),
  });
}

export function useSaveRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name_fr: string; name_en: string }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/contact-roles/{role_id}", {
              params: { path: { role_id: id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/contact-roles", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/contact-roles/{role_id}", { params: { path: { role_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.roles }),
  });
}
