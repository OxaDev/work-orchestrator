import createClient from "openapi-fetch";

import { apiBaseUrl, BASE_URL } from "../config";
import type { components, paths } from "./schema";

export type UserRead = components["schemas"]["UserRead"];

/** Error body returned by every API error (ADR-0014). */
export interface ApiErrorBody {
  code: string;
  detail: string;
  params: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.code);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "code" in value;
}

const API_ROOT = apiBaseUrl(BASE_URL, window.location.origin);

/** Emits "expired" when the session cannot be renewed: the UI goes back to the login page. */
export const sessionEvents = new EventTarget();

const NO_REFRESH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"];

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Renews the session once for all concurrent callers (ADR-0030). A 409 means another tab
 * rotated the token a moment ago: the shared cookie jar already holds the new one.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= globalThis
    .fetch(`${API_ROOT}/api/v1/auth/refresh`, { method: "POST", credentials: "include" })
    .then((response) => response.ok || response.status === 409)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** fetch that renews an expired access token and replays the request once. */
async function fetchWithRefresh(request: Request): Promise<Response> {
  const replay = request.clone();
  // Resolve fetch at call time so interceptors installed later (tests, MSW) are honoured.
  const response = await globalThis.fetch(request);
  const path = new URL(request.url).pathname;
  if (response.status !== 401 || NO_REFRESH_PATHS.some((p) => path.endsWith(p))) {
    return response;
  }
  if (!(await refreshSession())) {
    sessionEvents.dispatchEvent(new Event("expired"));
    return response;
  }
  return globalThis.fetch(replay);
}

/** Typed client generated from the backend OpenAPI schema (ADR-0015). */
export const api = createClient<paths>({
  baseUrl: API_ROOT,
  credentials: "include",
  fetch: fetchWithRefresh,
});

/** Returns `data` or throws an ApiRequestError carrying the translatable error code. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (error !== undefined || (data === undefined && response.status !== 204)) {
    const body: ApiErrorBody = isApiErrorBody(error)
      ? { code: error.code, detail: error.detail ?? "", params: error.params ?? {} }
      : { code: "NETWORK_ERROR", detail: response.statusText, params: {} };
    throw new ApiRequestError(response.status, body);
  }
  return data as T;
}
