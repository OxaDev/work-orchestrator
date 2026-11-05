/**
 * Calendar helpers working on ISO calendar dates ("YYYY-MM-DD") in UTC, so the browser
 * time zone can never shift a day (ADR-0014).
 */

import type { Period, Slot } from "./api";

export const PERIODS: Period[] = ["AM", "PM"];

export function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function parse(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDays(isoDate: string, count: number): string {
  const date = parse(isoDate);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: iso(year, month, 1), to: iso(year, month, daysInMonth(year, month)) };
}

/** 0 = Monday ... 6 = Sunday (weeks start on Monday, Q-N1). */
export function weekdayIndex(isoDate: string): number {
  return (parse(isoDate).getUTCDay() + 6) % 7;
}

export function isWeekend(isoDate: string): boolean {
  return weekdayIndex(isoDate) >= 5;
}

/** Weeks (Monday to Sunday) covering the month; days outside the month are included. */
export function monthWeeks(year: number, month: number): string[][] {
  const first = iso(year, month, 1);
  const last = iso(year, month, daysInMonth(year, month));
  let cursor = addDays(first, -weekdayIndex(first));
  const end = addDays(last, 6 - weekdayIndex(last));
  const weeks: string[][] = [];
  while (cursor <= end) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function slotKey(slot: Slot): string {
  return `${slot.date}|${slot.period}`;
}

export function keyToSlot(key: string): Slot {
  const [date, period] = key.split("|");
  return { date: date!, period: period as Period };
}

/** Every half-day between two slots, inclusive, in chronological order. */
export function slotRange(a: Slot, b: Slot): Slot[] {
  const [start, end] = slotKey(a) <= slotKey(b) ? [a, b] : [b, a];
  const result: Slot[] = [];
  for (let day = start.date; day <= end.date; day = addDays(day, 1)) {
    for (const period of PERIODS) {
      const slot = { date: day, period };
      if (slotKey(slot) >= slotKey(start) && slotKey(slot) <= slotKey(end)) result.push(slot);
    }
  }
  return result;
}

export function todayIso(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Validates /agenda/:year[/:month] route params. */
export function parseYearMonth(
  year?: string,
  month?: string,
): { year: number; month: number } | null {
  const y = Number(year);
  const m = month === undefined ? 1 : Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    return null;
  }
  return { year: y, month: m };
}
