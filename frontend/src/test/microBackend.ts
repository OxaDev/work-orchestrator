/** In-memory fake of the micro agenda API (P5): subjects, categories, tasks, logs, standup. */

import { http, HttpResponse } from "msw";

import type { HalfDay } from "../features/agenda/api";
import type { CompatibilityRule, DailyLog, Task } from "../features/agenda/tasksApi";
import type { Category, Subject } from "../features/subjects/api";
import { agenda } from "./agendaBackend";
import { missionIds } from "./missionsBackend";

let sequence = 0;
const nextId = () => `00000000-0000-7000-b000-${String(++sequence).padStart(12, "0")}`;

export const micro = {
  subjects: [] as Subject[],
  categories: [] as Category[],
  tasks: [] as Task[],
  logs: new Map<string, DailyLog>(),
  lastBody: null as unknown,
  lastUrl: "",
};
export const microIds = { kafka: "", consumers: "", watch: "", category: "" };

const RULES: CompatibilityRule[] = [
  { kind: "MISSION", scopes: ["MISSION"], same_mission: true },
  { kind: "INTERCONTRACT", scopes: ["INTERCONTRACT", "PERSONAL", "TRAINING"], same_mission: false },
  { kind: "TRAINING", scopes: ["TRAINING"], same_mission: false },
  { kind: "LEAVE", scopes: [], same_mission: false },
  { kind: "PUBLIC_HOLIDAY", scopes: [], same_mission: false },
  { kind: "SICK_LEAVE", scopes: [], same_mission: false },
  { kind: "OFF", scopes: [], same_mission: false },
];

function subject(fields: Partial<Subject> & Pick<Subject, "title" | "scope">): Subject {
  return {
    id: nextId(),
    parent_id: null,
    mission_id: null,
    category_id: null,
    status: "OPEN",
    external_url: null,
    description: "",
    archived_at: null,
    task_count: 0,
    done_minutes: 0,
    ...fields,
  };
}

export function resetMicro(): void {
  sequence = 0;
  const category: Category = { id: nextId(), name_fr: "Veille", name_en: "Watch", usage: 1 };
  const kafka = subject({
    title: "Migration Kafka",
    scope: "MISSION",
    mission_id: missionIds.current,
    external_url: "https://jira.example.com/K-1",
  });
  const consumers = subject({
    title: "Consumers",
    scope: "MISSION",
    mission_id: missionIds.current,
    parent_id: kafka.id,
    task_count: 2,
    done_minutes: 90,
  });
  const watch = subject({ title: "Veille Rust", scope: "INTERCONTRACT", category_id: category.id });
  micro.subjects = [kafka, consumers, watch];
  micro.categories = [category];
  micro.tasks = [];
  micro.logs = new Map();
  micro.lastBody = null;
  micro.lastUrl = "";
  Object.assign(microIds, {
    kafka: kafka.id,
    consumers: consumers.id,
    watch: watch.id,
    category: category.id,
  });
}

/** Adds a task to the fake backend (test arrangement helper). */
export function addTask(
  fields: Partial<Task> & Pick<Task, "date" | "period" | "title">,
  subjectId = microIds.watch,
): Task {
  const s = micro.subjects.find((x) => x.id === subjectId)!;
  const task: Task = {
    id: nextId(),
    subject: { id: s.id, title: s.title, scope: s.scope, mission_id: s.mission_id },
    kind: "TASK",
    domains: [],
    starts_at: null,
    duration_minutes: 60,
    status: "PLANNED",
    description: "",
    external_ref: null,
    participants: [],
    carried_from_id: null,
    ...fields,
  };
  micro.tasks.push(task);
  return task;
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

function compatible(halfDay: HalfDay | undefined, s: Subject): boolean {
  if (!halfDay) return s.scope !== "PERSONAL";
  const rule = RULES.find((r) => r.kind === halfDay.kind)!;
  return (
    rule.scopes.includes(s.scope) && (!rule.same_mission || halfDay.mission_id === s.mission_id)
  );
}

/** Places on a slot like the server (ADR-0034): fills an empty half-day. */
function place(date: string, period: Task["period"], s: Subject): string | null {
  const key = `${date}|${period}`;
  const halfDay = agenda.halfDays.get(key);
  if (!compatible(halfDay, s)) return "TASK_INCOMPATIBLE_HALF_DAY";
  if (!halfDay) {
    const kind =
      s.scope === "MISSION" ? "MISSION" : s.scope === "TRAINING" ? "TRAINING" : "INTERCONTRACT";
    agenda.halfDays.set(key, {
      date,
      period,
      kind,
      mission_id: s.mission_id,
      subtype_id: null,
      location: null,
      note: null,
    });
  }
  return null;
}

function warnings(date: string, period: Task["period"]) {
  const total = micro.tasks
    .filter((t) => t.date === date && t.period === period)
    .filter((t) => t.status === "PLANNED" || t.status === "DONE")
    .reduce((sum, t) => sum + t.duration_minutes, 0);
  return total > 240
    ? [
        {
          code: "HALF_DAY_OVERBOOKED",
          params: { date, period, totalMinutes: total, maxMinutes: 240 },
        },
      ]
    : [];
}

const sorted = (tasks: Task[]) =>
  [...tasks].sort((a, b) => `${a.date}|${a.period}`.localeCompare(`${b.date}|${b.period}`));

function log(day: string): DailyLog {
  return (
    micro.logs.get(day) ?? { date: day, done: "", planned: "", blockers: "", updated_at: null }
  );
}

/** Request body minus the ids that the read model replaces with summaries. */
function withoutRefs(body: TaskBody): Partial<Task> {
  const fields: TaskBody = { ...body };
  delete fields.subject_id;
  delete fields.participant_ids;
  return fields as Partial<Task>;
}

type TaskBody = Partial<Omit<Task, "subject" | "participants">> & {
  subject_id?: string;
  participant_ids?: string[];
};

export const microHandlers = [
  http.get("*/api/v1/subjects", ({ request }) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const mission = url.searchParams.get("mission_id");
    const archived = url.searchParams.get("include_archived") === "true";
    return HttpResponse.json(
      micro.subjects.filter(
        (s) =>
          (!scope || s.scope === scope) &&
          (!mission || s.mission_id === mission) &&
          (archived || !s.archived_at),
      ),
    );
  }),
  http.post("*/api/v1/subjects", async ({ request }) => {
    const body = (await request.json()) as Partial<Subject> & Pick<Subject, "title" | "scope">;
    micro.lastBody = body;
    const created = subject(body);
    micro.subjects.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/subjects/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<Subject>;
    micro.lastBody = body;
    const found = micro.subjects.find((s) => s.id === params.id);
    if (!found) return error(404, "NOT_FOUND", { entity: "subject" });
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.post("*/api/v1/subjects/:id/:action", ({ params }) => {
    const found = micro.subjects.find((s) => s.id === params.id)!;
    micro.lastUrl = `${String(params.action)}:${found.id}`;
    const subtree = new Set([found.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const s of micro.subjects) {
        if (s.parent_id && subtree.has(s.parent_id) && !subtree.has(s.id)) {
          subtree.add(s.id);
          grew = true;
        }
      }
    }
    for (const s of micro.subjects) {
      if (subtree.has(s.id))
        s.archived_at = params.action === "archive" ? "2026-11-05T10:00:00Z" : null;
    }
    return HttpResponse.json(found);
  }),
  http.delete("*/api/v1/subjects/:id", ({ params }) => {
    if (micro.subjects.some((s) => s.parent_id === params.id)) {
      return error(409, "ENTITY_REFERENCED", { entity: "subject", referencedBy: "subject" });
    }
    micro.subjects = micro.subjects.filter((s) => s.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/subject-categories", () => HttpResponse.json(micro.categories)),
  http.post("*/api/v1/subject-categories", async ({ request }) => {
    const body = (await request.json()) as Omit<Category, "id" | "usage">;
    micro.lastBody = body;
    const created = { id: nextId(), usage: 0, ...body };
    micro.categories.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/subject-categories/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<Category>;
    const found = micro.categories.find((c) => c.id === params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete("*/api/v1/subject-categories/:id", ({ params }) => {
    micro.categories = micro.categories.filter((c) => c.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/api/v1/agenda/compatibility", () => HttpResponse.json(RULES)),
  http.get("*/api/v1/agenda/tasks", ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from")!;
    const to = url.searchParams.get("to")!;
    return HttpResponse.json(sorted(micro.tasks.filter((t) => t.date >= from && t.date <= to)));
  }),
  http.post("*/api/v1/agenda/tasks", async ({ request }) => {
    const body = (await request.json()) as TaskBody & Pick<Task, "date" | "period" | "title">;
    micro.lastBody = body;
    const s = micro.subjects.find((x) => x.id === body.subject_id);
    if (!s) return error(404, "NOT_FOUND", { entity: "subject" });
    const refused = place(body.date, body.period, s);
    if (refused) return error(409, refused, { halfDayKind: "?", subjectScope: s.scope });
    const task = addTask(
      { ...withoutRefs(body), date: body.date, period: body.period, title: body.title },
      s.id,
    );
    return HttpResponse.json({ task, warnings: warnings(task.date, task.period) }, { status: 201 });
  }),
  http.patch("*/api/v1/agenda/tasks/:id", async ({ params, request }) => {
    const body = (await request.json()) as TaskBody;
    micro.lastBody = body;
    const task = micro.tasks.find((t) => t.id === params.id);
    if (!task) return error(404, "NOT_FOUND", { entity: "task" });
    const s = micro.subjects.find((x) => x.id === (body.subject_id ?? task.subject.id))!;
    const date = body.date ?? task.date;
    const period = body.period ?? task.period;
    if (date !== task.date || period !== task.period) {
      const refused = place(date, period, s);
      if (refused) return error(409, refused);
    }
    const fields = withoutRefs(body);
    Object.assign(task, fields, {
      date,
      period,
      subject: { id: s.id, title: s.title, scope: s.scope, mission_id: s.mission_id },
    });
    return HttpResponse.json({ task, warnings: warnings(date, period) });
  }),
  http.delete("*/api/v1/agenda/tasks/:id", ({ params }) => {
    micro.lastUrl = `delete:${String(params.id)}`;
    micro.tasks = micro.tasks.filter((t) => t.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/agenda/tasks/:id/carry-over", async ({ params, request }) => {
    const body = (await request.json()) as { not_before: string | null };
    micro.lastBody = body;
    const task = micro.tasks.find((t) => t.id === params.id)!;
    if (task.status !== "PLANNED") return error(409, "TASK_NOT_PLANNED");
    task.status = "CARRIED_OVER";
    const copy = addTask(
      {
        ...task,
        id: undefined,
        date: body.not_before ?? task.date,
        period: "AM",
        status: "PLANNED",
        carried_from_id: task.id,
      },
      task.subject.id,
    );
    copy.id = `${task.id}-copy`;
    return HttpResponse.json({ task: copy, warnings: [] });
  }),
  http.get("*/api/v1/agenda/daily-logs/:day", ({ params }) =>
    HttpResponse.json(log(String(params.day))),
  ),
  http.put("*/api/v1/agenda/daily-logs/:day", async ({ params, request }) => {
    const body = (await request.json()) as Omit<DailyLog, "date" | "updated_at">;
    micro.lastBody = body;
    const saved = { ...body, date: String(params.day), updated_at: "2026-11-05T10:00:00Z" };
    micro.logs.set(saved.date, saved);
    return HttpResponse.json(saved);
  }),
  http.get("*/api/v1/agenda/standup", ({ request }) => {
    const day = new URL(request.url).searchParams.get("date")!;
    const earlier = micro.tasks.map((t) => t.date).filter((d) => d < day);
    const previous = earlier.length ? earlier.sort().at(-1)! : null;
    return HttpResponse.json({
      day,
      previous_day: previous,
      previous: sorted(micro.tasks.filter((t) => t.date === previous)),
      today: sorted(micro.tasks.filter((t) => t.date === day)),
      log: log(day),
    });
  }),
];
