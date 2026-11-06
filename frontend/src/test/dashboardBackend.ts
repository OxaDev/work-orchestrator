/** In-memory fake of the dashboard API (P10) for component tests. */

import { http, HttpResponse } from "msw";

import type { Career, MissionOverview } from "../features/dashboard/api";
import { ids } from "./directoryBackend";
import { missionIds, missions } from "./missionsBackend";

export const dash = {
  overview: null as unknown as MissionOverview,
  career: { missions: [] } as Career,
};

export function resetDashboard(): void {
  const mission = missions.items.find((m) => m.id === missionIds.current)!;
  const summary = mission;
  const base = {
    id: summary.id,
    title: summary.title,
    job_title: summary.job_title,
    client: summary.client,
    employer: summary.employer,
    start_date: summary.start_date,
    planned_end_date: summary.planned_end_date,
    actual_end_date: summary.actual_end_date,
    status: summary.status,
    suggested_status: summary.suggested_status,
    color: summary.color,
    archived_at: summary.archived_at,
  };
  const subject = (n: number, name: string, minutes: number, count: number) => ({
    subject: { id: `subject-${n}`, name },
    minutes,
    task_count: count,
  });
  dash.overview = {
    mission: base,
    time: {
      half_days_done: 41,
      half_days_planned: 4,
      days_done: 20.5,
      days_planned: 2,
      days_remaining: 33,
      done_minutes: 1290,
      by_subject: [
        subject(1, "Migration Kafka", 600, 8),
        subject(2, "SSO", 300, 4),
        subject(3, "Revues", 120, 3),
        subject(4, "Support", 90, 2),
        subject(5, "Démos", 60, 1),
        subject(6, "Docs", 60, 1),
        subject(7, "Veille", 40, 1),
        subject(8, "Divers", 20, 1),
      ],
    },
    recent_tasks: [],
    planned_tasks: [],
    technologies: [
      {
        technology: { id: ids.python, name: "Python" },
        category: "LANGUAGE",
        weight: 4,
        version: "3.13",
        suggested_weight: 2,
        minutes: 120,
      },
      {
        technology: { id: "tech-kafka", name: "Kafka" },
        category: "MESSAGING",
        weight: null,
        version: null,
        suggested_weight: 5,
        minutes: 600,
      },
    ],
    contacts_by_role: [
      {
        role: mission.contacts[0]!.role,
        contacts: [{ contact: mission.contacts[0]!.contact, job_title: "Responsable Paiements" }],
      },
    ],
    architectures: [],
    documents: [],
    backlinks: [],
  };
  dash.career = {
    missions: [
      {
        mission: base,
        days: 20.5,
        technologies: [{ technology: { id: ids.python, name: "Python" }, weight: 4 }],
      },
    ],
  };
}

export const dashboardHandlers = [
  http.get("*/api/v1/missions/:id/overview", ({ params }) =>
    params.id === dash.overview.mission.id
      ? HttpResponse.json(dash.overview)
      : HttpResponse.json({ code: "NOT_FOUND", detail: "", params: {} }, { status: 404 }),
  ),
  http.get("*/api/v1/career", () => HttpResponse.json(dash.career)),
];
