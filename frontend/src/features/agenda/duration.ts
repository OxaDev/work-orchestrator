/** "45 min", "2 h", "1 h 30": compact durations for task cards and totals. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** RG-06: above this, a half-day is overbooked (a warning, never an error). */
export const HALF_DAY_MINUTES = 240;
