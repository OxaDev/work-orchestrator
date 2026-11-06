/** In-memory fake of the week template API (P6) for component tests. */

import { http, HttpResponse } from "msw";

import type { HalfDay } from "../features/agenda/api";
import { addDays, weekdayIndex } from "../features/agenda/calendar";
import type {
  ApplicationPlan,
  PlanAction,
  TemplateApplication,
  WeekTemplate,
} from "../features/agenda/templatesApi";
import { agenda } from "./agendaBackend";

let sequence = 0;
const nextId = () => `00000000-0000-7000-c000-${String(++sequence).padStart(12, "0")}`;

export const templates = {
  items: [] as WeekTemplate[],
  lastBody: null as unknown,
  lastUrl: "",
};

export function resetTemplates(): void {
  sequence = 0;
  templates.items = [];
  templates.lastBody = null;
  templates.lastUrl = "";
}

/** Adds a template (test arrangement helper). */
export function addTemplate(fields: Partial<WeekTemplate> & Pick<WeekTemplate, "name">) {
  const template: WeekTemplate = {
    id: nextId(),
    description: "",
    mission_id: null,
    slots: [],
    updated_at: "2026-11-05T10:00:00Z",
    ...fields,
  };
  templates.items.push(template);
  return template;
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

function plan(template: WeekTemplate, body: TemplateApplication): ApplicationPlan {
  const items: ApplicationPlan["items"] = [];
  for (let day = body.start; day <= body.end; day = addDays(day, 1)) {
    for (const period of ["AM", "PM"] as const) {
      const slot = template.slots.find(
        (s) => s.weekday === weekdayIndex(day) && s.period === period,
      );
      if (!slot) continue;
      const mission_id =
        slot.kind === "MISSION"
          ? (slot.mission_id ?? body.mission_id ?? template.mission_id ?? null)
          : null;
      const existing: HalfDay | undefined = agenda.halfDays.get(`${day}|${period}`);
      let action: PlanAction;
      if (agenda.locked.has(day.slice(0, 7))) action = "LOCKED";
      else if (!existing) action = "CREATE";
      else if (
        existing.kind === slot.kind &&
        existing.mission_id === mission_id &&
        existing.location === (slot.location ?? null)
      )
        action = "UNCHANGED";
      else if (body.strategy !== "OVERWRITE") action = "KEEP";
      else action = "OVERWRITE";
      items.push({
        date: day,
        period,
        action,
        kind: slot.kind,
        subtype_id: slot.subtype_id ?? null,
        mission_id,
        location: slot.location ?? null,
        existing: existing ?? null,
      });
    }
  }
  const counts: ApplicationPlan["counts"] = {};
  for (const item of items) counts[item.action] = (counts[item.action] ?? 0) + 1;
  return {
    start: body.start,
    end: body.end,
    strategy: body.strategy ?? "SKIP",
    items,
    counts,
    applied: 0,
  };
}

export const templatesHandlers = [
  http.get("*/api/v1/agenda/week-templates", ({ request }) => {
    const mission = new URL(request.url).searchParams.get("mission_id");
    return HttpResponse.json(templates.items.filter((t) => !mission || t.mission_id === mission));
  }),
  http.post("*/api/v1/agenda/week-templates", async ({ request }) => {
    const body = (await request.json()) as WeekTemplate;
    templates.lastBody = body;
    return HttpResponse.json(addTemplate(body), { status: 201 });
  }),
  http.get("*/api/v1/agenda/week-templates/:id", ({ params }) => {
    const found = templates.items.find((t) => t.id === params.id);
    return found ? HttpResponse.json(found) : error(404, "NOT_FOUND", { entity: "weekTemplate" });
  }),
  http.patch("*/api/v1/agenda/week-templates/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<WeekTemplate>;
    templates.lastBody = body;
    const found = templates.items.find((t) => t.id === params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete("*/api/v1/agenda/week-templates/:id", ({ params }) => {
    templates.lastUrl = `delete:${String(params.id)}`;
    templates.items = templates.items.filter((t) => t.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/agenda/week-templates/:id/duplicate", async ({ params, request }) => {
    const body = (await request.json()) as { name: string };
    templates.lastBody = body;
    const source = templates.items.find((t) => t.id === params.id)!;
    if (templates.items.some((t) => t.name.toLowerCase() === body.name.toLowerCase())) {
      return error(409, "NAME_ALREADY_USED", { entity: "weekTemplate" });
    }
    return HttpResponse.json(addTemplate({ ...source, id: nextId(), name: body.name }), {
      status: 201,
    });
  }),
  http.post("*/api/v1/agenda/week-templates/:id/:action", async ({ params, request }) => {
    const body = (await request.json()) as TemplateApplication;
    templates.lastBody = body;
    templates.lastUrl = String(params.action);
    const template = templates.items.find((t) => t.id === params.id)!;
    if (
      template.slots.some((s) => s.kind === "MISSION" && !s.mission_id) &&
      !body.mission_id &&
      !template.mission_id
    ) {
      return error(422, "WEEK_TEMPLATE_MISSION_REQUIRED");
    }
    const result = plan(template, body);
    if (params.action === "apply") {
      for (const item of result.items) {
        if (item.action !== "CREATE" && item.action !== "OVERWRITE") continue;
        agenda.halfDays.set(`${item.date}|${item.period}`, {
          date: item.date,
          period: item.period,
          kind: item.kind,
          mission_id: item.mission_id,
          subtype_id: item.subtype_id,
          location: item.location,
          note: item.existing?.note ?? null,
        });
        result.applied += 1;
      }
    }
    return HttpResponse.json(result);
  }),
];
