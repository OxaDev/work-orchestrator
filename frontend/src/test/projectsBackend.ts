/** In-memory fake of the projects API (ADR-0042) for component tests. */

import { http, HttpResponse } from "msw";

import type { ProjectSummary } from "../features/projects/api";
import { missionIds, missions } from "./missionsBackend";

let sequence = 0;
const nextId = () => `00000000-0000-7000-e000-${String(++sequence).padStart(12, "0")}`;

interface StoredProject {
  id: string;
  mission_id: string;
  name: string;
  description: string;
  archived_at: string | null;
}

export const projects = {
  items: [] as StoredProject[],
  lastBody: null as unknown,
  lastUrl: "",
};
export const projectIds = { current: "" };

export function addProject(fields: Partial<StoredProject> & Pick<StoredProject, "name">) {
  const project: StoredProject = {
    id: nextId(),
    mission_id: missionIds.current,
    description: "",
    archived_at: null,
    ...fields,
  };
  projects.items.push(project);
  return project;
}

export function resetProjects(): void {
  sequence = 0;
  projects.items = [];
  projects.lastBody = null;
  projects.lastUrl = "";
  const payments = addProject({ name: "Refonte des paiements", description: "Le **projet**." });
  projectIds.current = payments.id;
}

export function projectRead(p: StoredProject): ProjectSummary {
  const mission = missions.items.find((m) => m.id === p.mission_id);
  return {
    id: p.id,
    mission: { id: p.mission_id, name: mission?.title ?? "?" },
    client: mission?.client ?? { id: "?", name: "?" },
    name: p.name,
    description: p.description,
    archived_at: p.archived_at,
    document_count: 0,
    architecture_count: 0,
  };
}

const find = (id: unknown) => projects.items.find((p) => p.id === id);
const notFound = () =>
  HttpResponse.json({ code: "NOT_FOUND", detail: "NOT_FOUND", params: {} }, { status: 404 });

export const projectsHandlers = [
  http.get("*/api/v1/projects", ({ request }) => {
    const url = new URL(request.url);
    const missionId = url.searchParams.get("mission_id");
    const archived = url.searchParams.get("include_archived") === "true";
    const items = projects.items
      .filter((p) => !missionId || p.mission_id === missionId)
      .filter((p) => archived || !p.archived_at)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(projectRead);
    return HttpResponse.json({ items, total: items.length });
  }),
  http.post("*/api/v1/projects", async ({ request }) => {
    const body = (await request.json()) as {
      mission_id: string;
      name: string;
      description: string;
    };
    projects.lastBody = body;
    const created = addProject(body);
    return HttpResponse.json(projectRead(created), { status: 201 });
  }),
  http.get("*/api/v1/projects/:id", ({ params }) => {
    const found = find(params.id);
    return found ? HttpResponse.json(projectRead(found)) : notFound();
  }),
  http.patch("*/api/v1/projects/:id", async ({ params, request }) => {
    const found = find(params.id);
    if (!found) return notFound();
    const body = (await request.json()) as Partial<StoredProject>;
    projects.lastBody = body;
    Object.assign(found, body);
    return HttpResponse.json(projectRead(found));
  }),
  http.post("*/api/v1/projects/:id/:action", ({ params }) => {
    const found = find(params.id);
    if (!found) return notFound();
    projects.lastUrl = String(params.action);
    found.archived_at = params.action === "archive" ? "2026-11-06T10:00:00Z" : null;
    return HttpResponse.json(projectRead(found));
  }),
  http.delete("*/api/v1/projects/:id", ({ params }) => {
    projects.lastUrl = `delete:${String(params.id)}`;
    projects.items = projects.items.filter((p) => p.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
