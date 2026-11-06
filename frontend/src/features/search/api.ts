import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

export type SearchResult = components["schemas"]["SearchResult"];
export type SearchType = SearchResult["type"];

/** Global full-text search (P11-2, ADR-0040); the caller debounces the query. */
export function useGlobalSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ["search", query],
    queryFn: () =>
      unwrap(api.GET("/api/v1/search", { params: { query: { q: query, limit: 20 } } })),
    enabled: query.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/** Where a result opens. Tasks and logs open their day; technologies have no page of their own. */
export function resultPath(result: SearchResult): string {
  const date = result.date ?? "";
  switch (result.type) {
    case "document":
      return `/documents/${result.id}`;
    case "daily_log":
      return `/agenda/standup?date=${date}`;
    case "task":
      return `/agenda/${date.slice(0, 4)}/${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
    case "subject":
      return `/subjects/${result.id}`;
    case "domain":
      return `/architecture/domains/${result.id}`;
    case "architecture":
      return `/architecture/architectures/${result.id}`;
    case "mission":
      return `/missions/${result.id}`;
    case "contact":
      return `/directory/contacts/${result.id}`;
    case "company":
      return `/directory/companies/${result.id}`;
    case "technology":
      return `/directory/technologies?q=${encodeURIComponent(result.title)}`;
  }
}
