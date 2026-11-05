/**
 * Base-path helpers (ADR-0011). Vite injects BASE_URL from `base`, always with a trailing
 * slash: "/work-orchestrator/" behind the reverse proxy, "/" at the root.
 */

/** Router basename: "/work-orchestrator" or "/". */
export function routerBasename(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") || "/";
}

/** Absolute API origin + prefix used by the API client (paths already start with /api). */
export function apiBaseUrl(baseUrl: string, origin: string): string {
  return `${origin}${baseUrl.replace(/\/+$/, "")}`;
}

export const BASE_URL = import.meta.env.BASE_URL;
export const ROUTER_BASENAME = routerBasename(BASE_URL);
