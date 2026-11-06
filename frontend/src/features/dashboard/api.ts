/** TanStack Query hooks for the mission dashboard and the career view (P10, ADR-0039). */

import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type MissionOverview = S["MissionOverview"];
export type TechnologyWeight = S["TechnologyWeight"];
export type CareerEntry = S["CareerEntry"];
export type Career = S["Career"];

export const dashboardKeys = {
  overview: (id: string) => ["dashboard", "overview", id] as const,
  career: ["dashboard", "career"] as const,
};

export function useMissionOverview(id: string) {
  return useQuery({
    queryKey: dashboardKeys.overview(id),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/missions/{mission_id}/overview", {
          params: { path: { mission_id: id } },
        }),
      ),
  });
}

export function useCareer() {
  return useQuery({
    queryKey: dashboardKeys.career,
    queryFn: () => unwrap(api.GET("/api/v1/career")),
  });
}
