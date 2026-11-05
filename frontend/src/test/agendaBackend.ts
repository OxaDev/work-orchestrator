/** In-memory fake of the agenda API (P4) for component tests. */

import { http, HttpResponse } from "msw";

import type { HalfDay, MonthStatus, Slot, Stats, Subtype } from "../features/agenda/api";
import { addDays, isWeekend, monthRange } from "../features/agenda/calendar";

const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "Jour de l'an",
  "2026-11-01": "Toussaint",
  "2026-11-11": "Armistice",
  "2026-12-25": "Noël",
};

export const agenda = {
  halfDays: new Map<string, HalfDay>(),
  locked: new Map<string, { at: string; note: string | null }>(),
  events: [] as MonthStatus["events"],
  subtypes: [] as Subtype[],
  lastBody: null as unknown,
  generated: [] as number[],
  unfilled: { count: 0, since: "2026-11-01", until: "2026-11-04", slots: [] as Slot[] },
};
export const agendaIds = { paidLeave: "" };

export function resetAgenda(): void {
  agenda.halfDays = new Map();
  agenda.locked = new Map();
  agenda.events = [];
  agenda.subtypes = [
    { id: "subtype-cp", kind: "LEAVE", name_fr: "Congés payés", name_en: "Paid leave", usage: 0 },
  ];
  agenda.lastBody = null;
  agenda.generated = [];
  agenda.unfilled = { count: 0, since: "2026-11-01", until: "2026-11-04", slots: [] };
  agendaIds.paidLeave = "subtype-cp";
}

const key = (s: Slot) => `${s.date}|${s.period}`;
const monthKey = (date: string) => date.slice(0, 7);
const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

function between(from: string, to: string): HalfDay[] {
  return [...agenda.halfDays.values()]
    .filter((h) => h.date >= from && h.date <= to)
    .sort((a, b) => key(a).localeCompare(key(b)));
}

function expected(from: string, to: string): Slot[] {
  const result: Slot[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isWeekend(day) && !HOLIDAYS[day]) {
      result.push({ date: day, period: "AM" }, { date: day, period: "PM" });
    }
  }
  return result;
}

function stats(from: string, to: string): Stats {
  const rows = between(from, to);
  const byKind = new Map<string, number>();
  for (const row of rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 0.5);
  const missing = expected(from, to).filter((s) => !agenda.halfDays.has(key(s)));
  return {
    period_start: from,
    period_end: to,
    working_days: expected(from, to).length / 2,
    filled_days: rows.length / 2,
    by_kind: [...byKind].map(([kind, days]) => ({ kind: kind as HalfDay["kind"], days })),
    by_mission: [],
    by_location: [],
    unfilled_count: missing.length,
  };
}

function monthStatus(year: number, month: number): MonthStatus {
  const { from, to } = monthRange(year, month);
  const lock = agenda.locked.get(from.slice(0, 7));
  return {
    year,
    month,
    locked: Boolean(lock),
    locked_at: lock?.at ?? null,
    note: lock?.note ?? null,
    missing: expected(from, to).filter((s) => !agenda.halfDays.has(key(s))),
    stats: stats(from, to),
    events: agenda.events,
  };
}

function lockedMonths(slots: Slot[]): string[] {
  return [...new Set(slots.map((s) => monthKey(s.date)))]
    .filter((m) => agenda.locked.has(m))
    .sort();
}

export const agendaHandlers = [
  http.get("*/api/v1/agenda/half-days", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(between(url.searchParams.get("from")!, url.searchParams.get("to")!));
  }),
  http.post("*/api/v1/agenda/half-days/bulk", async ({ request }) => {
    const body = (await request.json()) as Omit<HalfDay, "date" | "period"> & { slots: Slot[] };
    agenda.lastBody = body;
    const locked = lockedMonths(body.slots);
    if (locked.length) return error(409, "MONTH_LOCKED", { months: locked });
    if (body.kind === "MISSION" && !body.mission_id) return error(422, "HALF_DAY_MISSION_REQUIRED");
    const items = body.slots.map((slot) => {
      const row: HalfDay = {
        ...slot,
        kind: body.kind,
        mission_id: body.mission_id ?? null,
        subtype_id: body.subtype_id ?? null,
        location: body.location ?? null,
        note: body.note ?? null,
      };
      agenda.halfDays.set(key(slot), row);
      return row;
    });
    return HttpResponse.json({ items, count: items.length });
  }),
  http.post("*/api/v1/agenda/half-days/bulk-delete", async ({ request }) => {
    const body = (await request.json()) as { slots: Slot[] };
    agenda.lastBody = body;
    const locked = lockedMonths(body.slots);
    if (locked.length) return error(409, "MONTH_LOCKED", { months: locked });
    for (const slot of body.slots) agenda.halfDays.delete(key(slot));
    return HttpResponse.json({ items: [], count: body.slots.length });
  }),
  http.get("*/api/v1/agenda/public-holidays", ({ request }) => {
    const year = new URL(request.url).searchParams.get("year")!;
    return HttpResponse.json(
      Object.entries(HOLIDAYS)
        .filter(([date]) => date.startsWith(year))
        .map(([date, name]) => ({ date, name })),
    );
  }),
  http.post("*/api/v1/agenda/public-holidays/generate", ({ request }) => {
    const year = Number(new URL(request.url).searchParams.get("year"));
    const already = agenda.generated.includes(year);
    let created = 0;
    if (!already) {
      agenda.generated.push(year);
      for (const [date, name] of Object.entries(HOLIDAYS)) {
        if (!date.startsWith(String(year))) continue;
        for (const period of ["AM", "PM"] as const) {
          if (!agenda.halfDays.has(`${date}|${period}`)) {
            agenda.halfDays.set(`${date}|${period}`, {
              date,
              period,
              kind: "PUBLIC_HOLIDAY",
              mission_id: null,
              subtype_id: null,
              location: null,
              note: name,
            });
            created += 1;
          }
        }
      }
    }
    return HttpResponse.json({ created, skipped_locked: 0, already_generated: already });
  }),
  http.get("*/api/v1/agenda/stats", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(stats(url.searchParams.get("from")!, url.searchParams.get("to")!));
  }),
  http.get("*/api/v1/agenda/unfilled", () => HttpResponse.json(agenda.unfilled)),
  http.get("*/api/v1/agenda/months", ({ request }) => {
    const year = Number(new URL(request.url).searchParams.get("year"));
    return HttpResponse.json(
      Array.from({ length: 12 }, (_, i) => {
        const lock = agenda.locked.get(`${year}-${String(i + 1).padStart(2, "0")}`);
        return { year, month: i + 1, locked: Boolean(lock), locked_at: lock?.at ?? null };
      }),
    );
  }),
  http.get("*/api/v1/agenda/months/:year/:month", ({ params }) =>
    HttpResponse.json(monthStatus(Number(params.year), Number(params.month))),
  ),
  http.post("*/api/v1/agenda/months/:year/:month/lock", async ({ params, request }) => {
    const year = Number(params.year);
    const month = Number(params.month);
    const body = (await request.json()) as { note: string | null };
    agenda.lastBody = body;
    const status = monthStatus(year, month);
    if (status.missing.length) {
      return error(422, "MONTH_INCOMPLETE", { count: status.missing.length, missing: [] });
    }
    agenda.locked.set(monthRange(year, month).from.slice(0, 7), {
      at: "2026-11-30T18:00:00Z",
      note: body.note,
    });
    agenda.events.unshift({ action: "LOCK", reason: body.note, at: "2026-11-30T18:00:00Z" });
    return HttpResponse.json(monthStatus(year, month));
  }),
  http.post("*/api/v1/agenda/months/:year/:month/unlock", async ({ params, request }) => {
    const year = Number(params.year);
    const month = Number(params.month);
    const body = (await request.json()) as { reason: string };
    agenda.lastBody = body;
    agenda.locked.delete(monthRange(year, month).from.slice(0, 7));
    agenda.events.unshift({ action: "UNLOCK", reason: body.reason, at: "2026-12-01T09:00:00Z" });
    return HttpResponse.json(monthStatus(year, month));
  }),
  http.get("*/api/v1/agenda/subtypes", () => HttpResponse.json(agenda.subtypes)),
  http.post("*/api/v1/agenda/subtypes", async ({ request }) => {
    const body = (await request.json()) as Omit<Subtype, "id" | "usage">;
    agenda.lastBody = body;
    const subtype = { id: `subtype-${agenda.subtypes.length + 1}`, usage: 0, ...body };
    agenda.subtypes.push(subtype);
    return HttpResponse.json(subtype, { status: 201 });
  }),
  http.patch("*/api/v1/agenda/subtypes/:id", async ({ params, request }) => {
    const subtype = agenda.subtypes.find((s) => s.id === params.id)!;
    const body = (await request.json()) as Partial<Subtype>;
    agenda.lastBody = body;
    Object.assign(subtype, body);
    return HttpResponse.json(subtype);
  }),
  http.delete("*/api/v1/agenda/subtypes/:id", ({ params }) => {
    const subtype = agenda.subtypes.find((s) => s.id === params.id)!;
    if (subtype.usage > 0) {
      return error(409, "ENTITY_REFERENCED", { entity: "halfDaySubtype", referencedBy: "halfDay" });
    }
    agenda.subtypes = agenda.subtypes.filter((s) => s.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
