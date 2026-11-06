/** Pure helpers of the micro agenda (P5): placement checks, week bounds, standup text. */

import type { SubjectScope } from "../subjects/api";
import type { HalfDay } from "./api";
import { addDays, weekdayIndex } from "./calendar";
import type { CompatibilityRule, Standup, Task } from "./tasksApi";

interface SubjectLike {
  scope: SubjectScope;
  mission_id: string | null;
}

/**
 * Mirrors the server rule (ADR-0020) using the matrix it serves. An empty half-day accepts any
 * subject with a natural kind, i.e. not PERSONAL (ADR-0034); mission dates are left to the server.
 */
export function canPlace(
  rules: readonly CompatibilityRule[] | undefined,
  halfDay: Pick<HalfDay, "kind" | "mission_id"> | undefined,
  subject: SubjectLike,
): boolean {
  if (!halfDay) return subject.scope !== "PERSONAL";
  const rule = rules?.find((r) => r.kind === halfDay.kind);
  if (!rule) return true; // matrix not loaded yet: let the server decide
  if (!rule.scopes.includes(subject.scope)) return false;
  return !rule.same_mission || halfDay.mission_id === subject.mission_id;
}

/** Monday of the week containing `isoDate` (weeks start on Monday, Q-N1). */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, -weekdayIndex(isoDate));
}

/** "/agenda/2026/11/4" for a day view. */
export function dayPath(isoDate: string): string {
  return `/agenda/${isoDate.slice(0, 4)}/${Number(isoDate.slice(5, 7))}/${Number(isoDate.slice(8, 10))}`;
}

/** Where a subject is managed: its mission page, or the subjects page of its scope. */
export function subjectLink(subject: Task["subject"]): string {
  return subject.mission_id
    ? `/missions/${subject.mission_id}?tab=subjects`
    : `/agenda/subjects?scope=${subject.scope}`;
}

/** Minutes that fill a half-day (RG-06): cancelled or carried-over work happened elsewhere. */
export function countedMinutes(tasks: readonly Task[]): number {
  return tasks
    .filter((task) => task.status === "PLANNED" || task.status === "DONE")
    .reduce((sum, task) => sum + task.duration_minutes, 0);
}

export interface StandupLabels {
  yesterday: (day: string) => string;
  today: string;
  blockers: string;
  nothing: string;
  none: string;
}

const bullet = (task: Task) =>
  `- ${task.title} (${task.subject.title})${task.external_ref ? ` [${task.external_ref}]` : ""}`;

const noteLines = (markdown: string) =>
  markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith("- ") || line.startsWith("* ") ? `- ${line.slice(2)}` : `- ${line}`,
    );

/**
 * Daily scrum text (P5-9): what was done on the previous working day, what is planned today,
 * blockers. Built here, not by the API, because the API never returns prose (ADR-0013).
 */
export function standupText(standup: Standup, labels: StandupLabels): string {
  const done = standup.previous.filter((task) => task.status === "DONE").map(bullet);
  const planned = standup.today
    .filter((task) => task.status === "PLANNED" || task.status === "DONE")
    .map(bullet);
  const blockers = noteLines(standup.log.blockers);
  const section = (title: string, lines: string[], empty: string) =>
    [title, ...(lines.length ? lines : [`- ${empty}`])].join("\n");
  return [
    section(
      labels.yesterday(standup.previous_day ?? ""),
      [...done, ...noteLines(standup.log.done)],
      labels.nothing,
    ),
    section(labels.today, [...planned, ...noteLines(standup.log.planned)], labels.nothing),
    section(labels.blockers, blockers, labels.none),
  ].join("\n\n");
}
