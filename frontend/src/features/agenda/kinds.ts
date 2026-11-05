/**
 * Visual encoding of half-days (Q-N2): mission half-days use the mission colour, other kinds a
 * fixed colour plus a pattern, so the information never relies on colour alone (a11y).
 */

import type { HalfDayKind, WorkLocation } from "./api";

export const KINDS: HalfDayKind[] = [
  "MISSION",
  "INTERCONTRACT",
  "TRAINING",
  "LEAVE",
  "PUBLIC_HOLIDAY",
  "SICK_LEAVE",
  "OFF",
];

export const WORKING_KINDS: HalfDayKind[] = ["MISSION", "INTERCONTRACT", "TRAINING"];

export const LOCATIONS: WorkLocation[] = [
  "CLIENT_ON_SITE",
  "REMOTE_HOME",
  "REMOTE_ESN_OFFICE",
  "REMOTE_OTHER",
  "TRAVEL_MISSION",
  "TRAVEL_ESN",
];

type Pattern = "solid" | "stripes" | "dots" | "cross" | "dashes";

const STYLE: Record<Exclude<HalfDayKind, "MISSION">, { color: string; pattern: Pattern }> = {
  INTERCONTRACT: { color: "gray", pattern: "solid" },
  TRAINING: { color: "indigo", pattern: "dashes" },
  LEAVE: { color: "green", pattern: "stripes" },
  PUBLIC_HOLIDAY: { color: "red", pattern: "dots" },
  SICK_LEAVE: { color: "orange", pattern: "cross" },
  OFF: { color: "gray", pattern: "stripes" },
};

const shade = (color: string, n: number) => `var(--mantine-color-${color}-${n})`;

function paint(color: string, pattern: Pattern): string {
  const base = shade(color, pattern === "solid" ? 5 : 3);
  const ink = shade(color, 7);
  switch (pattern) {
    case "solid":
      return base;
    case "stripes":
      return `repeating-linear-gradient(45deg, ${ink} 0 2px, ${base} 2px 6px)`;
    case "dashes":
      return `repeating-linear-gradient(90deg, ${ink} 0 2px, ${base} 2px 7px)`;
    case "dots":
      return `radial-gradient(circle, ${ink} 1.2px, transparent 1.6px) 0 0 / 6px 6px, ${base}`;
    case "cross":
      return `repeating-linear-gradient(45deg, ${ink} 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, ${ink} 0 1px, ${base} 1px 6px)`;
  }
}

/** CSS background for a half-day; `missionColor` is used for MISSION half-days. */
export function halfDayBackground(kind: HalfDayKind, missionColor?: string): string {
  if (kind === "MISSION") return shade(missionColor ?? "blue", 5);
  const { color, pattern } = STYLE[kind];
  return paint(color, pattern);
}
