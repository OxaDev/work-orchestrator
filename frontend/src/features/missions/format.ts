/** Date formatting for calendar dates ("YYYY-MM-DD", no time zone: ADR-0014). */

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  // Built from parts so the browser's time zone can never shift the day.
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

export function missionEnd(mission: {
  actual_end_date: string | null;
  planned_end_date: string | null;
}): string | null {
  return mission.actual_end_date ?? mission.planned_end_date;
}
