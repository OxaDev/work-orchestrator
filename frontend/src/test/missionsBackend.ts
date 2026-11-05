/** In-memory fake of the missions API (P3) for component tests. */

import { http, HttpResponse } from "msw";

import type { MissionDetail, RoleWithUsage } from "../features/missions/api";
import { directory, ids } from "./directoryBackend";

const NOW = "2026-11-05T10:00:00Z";
let sequence = 0;
const nextId = () => `00000000-0000-7000-a000-${String(++sequence).padStart(12, "0")}`;

export const missions = {
  items: [] as MissionDetail[],
  roles: [] as RoleWithUsage[],
  lastBody: null as unknown,
  employerId: null as string | null,
};
export const missionIds = { current: "", manager: "" };

const company = (id: string) => {
  const c = directory.companies.find((x) => x.id === id)!;
  return { id: c.id, name: c.name };
};

export function resetMissions(): void {
  sequence = 0;
  const manager: RoleWithUsage = { id: nextId(), name_fr: "Manager", name_en: "Manager", usage: 1 };
  const current: MissionDetail = {
    id: nextId(),
    title: "Horizon — Paiements",
    job_title: "Tech lead",
    client: company(ids.bankCompany),
    employer: company(ids.esn),
    start_date: "2026-01-05",
    planned_end_date: "2026-12-31",
    actual_end_date: null,
    status: "PROSPECT",
    suggested_status: "ACTIVE",
    color: "teal",
    archived_at: null,
    location: "Paris",
    remote_policy: null,
    objectives: "- **Kafka**",
    description: "",
    review: "",
    daily_rate: null,
    contacts: [
      {
        contact: { id: ids.hugo, name: "Hugo Lefèvre" },
        job_title: "Responsable Paiements",
        company: company(ids.bankCompany),
        role: { id: manager.id, name_fr: "Manager", name_en: "Manager" },
        note: null,
      },
    ],
    technologies: [
      {
        technology: { id: ids.python, name: "Python" },
        category: "LANGUAGE",
        weight: 4,
        version: "3.13",
        note: null,
      },
    ],
    end_date_changes: [
      { old_date: "2026-06-30", new_date: "2026-12-31", changed_at: NOW, note: "Avenant 1" },
    ],
    created_at: NOW,
  };
  Object.assign(missions, {
    items: [current],
    roles: [manager],
    lastBody: null,
    employerId: ids.esn,
  });
  Object.assign(missionIds, { current: current.id, manager: manager.id });
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });
const find = (id: unknown) => missions.items.find((m) => m.id === id);
const notFound = () => error(404, "NOT_FOUND", { entity: "mission" });
async function body<T>(request: Request): Promise<T> {
  const parsed = (await request.json()) as T;
  missions.lastBody = parsed;
  return parsed;
}

export const missionsHandlers = [
  http.get("*/api/v1/missions", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("client_id");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const items = missions.items
      .filter((m) => url.searchParams.get("include_archived") === "true" || !m.archived_at)
      .filter((m) => !status || m.status === status)
      .filter((m) => !clientId || m.client.id === clientId)
      .filter((m) => !q || m.title.toLowerCase().includes(q));
    return HttpResponse.json({ items, total: items.length });
  }),
  http.post("*/api/v1/missions", async ({ request }) => {
    const data = await body<Record<string, string | null>>(request);
    const employer = data.employer_company_id ?? missions.employerId;
    if (!employer) return error(422, "MISSION_EMPLOYER_REQUIRED");
    const mission: MissionDetail = {
      ...missions.items[0]!,
      id: nextId(),
      title: data.title!,
      job_title: data.job_title!,
      client: company(data.client_id!),
      employer: company(employer),
      start_date: data.start_date!,
      planned_end_date: data.planned_end_date ?? null,
      status: (data.status as MissionDetail["status"]) ?? "ACTIVE",
      suggested_status: null,
      contacts: [],
      technologies: [],
      end_date_changes: [],
    };
    missions.items.push(mission);
    return HttpResponse.json(mission, { status: 201 });
  }),
  http.get("*/api/v1/missions/:id", ({ params }) => {
    const mission = find(params.id);
    return mission ? HttpResponse.json(mission) : notFound();
  }),
  http.patch("*/api/v1/missions/:id", async ({ params, request }) => {
    const mission = find(params.id);
    if (!mission) return notFound();
    const { end_date_change_note, client_id, employer_company_id, ...rest } =
      await body<Record<string, unknown>>(request);
    if (rest.planned_end_date !== undefined && rest.planned_end_date !== mission.planned_end_date) {
      mission.end_date_changes.unshift({
        old_date: mission.planned_end_date,
        new_date: rest.planned_end_date as string | null,
        changed_at: NOW,
        note: (end_date_change_note as string | null) ?? null,
      });
    }
    Object.assign(mission, rest);
    if (client_id) mission.client = company(client_id as string);
    if (employer_company_id) mission.employer = company(employer_company_id as string);
    if (rest.status) mission.suggested_status = null;
    return HttpResponse.json(mission);
  }),
  http.post("*/api/v1/missions/:id/:action", ({ params }) => {
    const mission = find(params.id);
    if (!mission) return notFound();
    mission.archived_at = params.action === "archive" ? NOW : null;
    return HttpResponse.json(mission);
  }),
  http.delete("*/api/v1/missions/:id", ({ params }) => {
    if (params.id === missionIds.current) {
      return error(409, "ENTITY_REFERENCED", { entity: "mission", referencedBy: "agenda" });
    }
    missions.items = missions.items.filter((m) => m.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("*/api/v1/missions/:id/contacts/:contactId", async ({ params, request }) => {
    const mission = find(params.id)!;
    const data = await body<{ role_id: string | null; note?: string | null }>(request);
    const contact = directory.contacts.find((c) => c.id === params.contactId)!;
    const role = missions.roles.find((r) => r.id === data.role_id);
    const link = {
      contact: { id: contact.id, name: `${contact.first_name} ${contact.last_name}` },
      job_title: contact.job_title,
      company: contact.company,
      role: role ? { id: role.id, name_fr: role.name_fr, name_en: role.name_en } : null,
      note: data.note ?? null,
    };
    mission.contacts = [...mission.contacts.filter((c) => c.contact.id !== contact.id), link];
    return HttpResponse.json(mission);
  }),
  http.delete("*/api/v1/missions/:id/contacts/:contactId", ({ params }) => {
    const mission = find(params.id)!;
    mission.contacts = mission.contacts.filter((c) => c.contact.id !== params.contactId);
    return HttpResponse.json(mission);
  }),
  http.put("*/api/v1/missions/:id/technologies/:techId", async ({ params, request }) => {
    const mission = find(params.id)!;
    const data = await body<{ weight: number; version?: string | null }>(request);
    const tech = directory.technologies.find((t) => t.id === params.techId)!;
    const link = {
      technology: { id: tech.id, name: tech.name },
      category: tech.category,
      weight: data.weight,
      version: data.version ?? null,
      note: null,
    };
    mission.technologies = [
      ...mission.technologies.filter((t) => t.technology.id !== tech.id),
      link,
    ];
    return HttpResponse.json(mission);
  }),
  http.delete("*/api/v1/missions/:id/technologies/:techId", ({ params }) => {
    const mission = find(params.id)!;
    mission.technologies = mission.technologies.filter((t) => t.technology.id !== params.techId);
    return HttpResponse.json(mission);
  }),
  http.get("*/api/v1/contact-roles", () => HttpResponse.json(missions.roles)),
  http.post("*/api/v1/contact-roles", async ({ request }) => {
    const data = await body<{ name_fr: string; name_en: string }>(request);
    const role = { id: nextId(), usage: 0, ...data };
    missions.roles.push(role);
    return HttpResponse.json(role, { status: 201 });
  }),
  http.patch("*/api/v1/contact-roles/:id", async ({ params, request }) => {
    const role = missions.roles.find((r) => r.id === params.id)!;
    Object.assign(role, await body<Partial<RoleWithUsage>>(request));
    return HttpResponse.json(role);
  }),
  http.delete("*/api/v1/contact-roles/:id", ({ params }) => {
    const role = missions.roles.find((r) => r.id === params.id)!;
    if (role.usage > 0) {
      return error(409, "ENTITY_REFERENCED", {
        entity: "contactRole",
        referencedBy: "missionContact",
      });
    }
    missions.roles = missions.roles.filter((r) => r.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
