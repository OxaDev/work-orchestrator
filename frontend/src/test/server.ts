import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { UserRead } from "../api/client";
import { agendaHandlers, resetAgenda } from "./agendaBackend";
import { directoryHandlers, resetDirectory } from "./directoryBackend";
import { missionsHandlers, resetMissions } from "./missionsBackend";

export const PASSWORD = "Correct-Horse-42";

export const regularUser: UserRead = {
  id: "00000000-0000-7000-8000-000000000001",
  email: "user@example.com",
  display_name: "Camille Martin",
  role: "USER",
  locale: "fr",
  theme: "light",
  is_active: true,
  last_login_at: "2026-11-05T09:00:00Z",
  created_at: "2026-11-01T09:00:00Z",
};

export const adminUser: UserRead = {
  ...regularUser,
  id: "00000000-0000-7000-8000-000000000002",
  email: "admin@example.com",
  display_name: "Admin Istrator",
  role: "ADMIN",
  last_login_at: null,
};

/** In-memory fake backend shared by the default handlers. Reset before each test. */
export const backend = {
  session: null as UserRead | null,
  users: [] as UserRead[],
  password: PASSWORD,
  lastPatch: null as Record<string, unknown> | null,
};

export function resetBackend(sessionUser: UserRead | null = regularUser): void {
  backend.users = [structuredClone(regularUser), structuredClone(adminUser)];
  backend.session = sessionUser
    ? (backend.users.find((u) => u.id === sessionUser.id) ?? null)
    : null;
  backend.password = PASSWORD;
  backend.lastPatch = null;
  resetDirectory();
  resetMissions();
  resetAgenda();
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

export const handlers = [
  http.get("*/api/v1/health", () =>
    HttpResponse.json({ status: "ok", database: "ok", version: "0.1.0" }),
  ),
  http.get("*/api/v1/auth/me", () =>
    backend.session ? HttpResponse.json(backend.session) : error(401, "AUTH_REQUIRED"),
  ),
  http.post("*/api/v1/auth/login", async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (email === "locked@example.com") {
      return error(429, "TOO_MANY_LOGIN_ATTEMPTS", { retryAfterSeconds: 540 });
    }
    const user = backend.users.find((u) => u.email === email.toLowerCase());
    if (!user || password !== backend.password) return error(401, "INVALID_CREDENTIALS");
    backend.session = user;
    return HttpResponse.json(user);
  }),
  http.post("*/api/v1/auth/refresh", () => error(401, "REFRESH_TOKEN_INVALID")),
  http.post("*/api/v1/auth/logout", () => {
    backend.session = null;
    return new HttpResponse(null, { status: 204 });
  }),
  ...directoryHandlers,
  ...missionsHandlers,
  ...agendaHandlers,
  http.patch("*/api/v1/me", async ({ request }) => {
    const changes = (await request.json()) as Record<string, unknown>;
    backend.lastPatch = changes;
    if (!backend.session) return error(401, "AUTH_REQUIRED");
    Object.assign(backend.session, changes);
    return HttpResponse.json(backend.session);
  }),
  http.post("*/api/v1/me/password", async ({ request }) => {
    const body = (await request.json()) as { current_password: string; new_password: string };
    if (body.current_password !== backend.password) {
      return error(400, "CURRENT_PASSWORD_INCORRECT");
    }
    backend.password = body.new_password;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/users", () =>
    HttpResponse.json({ items: backend.users, total: backend.users.length }),
  ),
  http.post("*/api/v1/users", async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      display_name: string;
      role: UserRead["role"];
    };
    if (backend.users.some((u) => u.email === body.email.toLowerCase())) {
      return error(409, "EMAIL_ALREADY_USED");
    }
    const user: UserRead = {
      ...regularUser,
      id: `00000000-0000-7000-8000-${String(backend.users.length + 1).padStart(12, "0")}`,
      email: body.email.toLowerCase(),
      display_name: body.display_name,
      role: body.role,
      last_login_at: null,
    };
    backend.users.push(user);
    return HttpResponse.json(user, { status: 201 });
  }),
  http.patch("*/api/v1/users/:id", async ({ params, request }) => {
    const user = backend.users.find((u) => u.id === params.id);
    if (!user) return error(404, "USER_NOT_FOUND");
    const changes = (await request.json()) as Partial<UserRead>;
    if (user.role === "ADMIN" && (changes.role === "USER" || changes.is_active === false)) {
      return error(409, "LAST_ADMIN");
    }
    Object.assign(user, changes);
    return HttpResponse.json(user);
  }),
  http.post("*/api/v1/users/:id/reset-password", ({ params }) => {
    const user = backend.users.find((u) => u.id === params.id);
    return user ? HttpResponse.json(user) : error(404, "USER_NOT_FOUND");
  }),
];

export const server = setupServer(...handlers);
