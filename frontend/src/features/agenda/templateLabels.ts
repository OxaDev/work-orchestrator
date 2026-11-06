import { useTranslation } from "react-i18next";

import type { TemplateSlot } from "./templatesApi";
import type { MissionInfo } from "./useLabels";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Localised weekday names, Monday first (Q-N1). */
export function useWeekdayNames(style: "long" | "short" = "long"): string[] {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, { weekday: style, timeZone: "UTC" });
  // 1 January 2024 was a Monday.
  return WEEKDAYS.map((i) => format.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/** Text of a template slot: mission title (or "default mission"), kind, place of work. */
export function useSlotText(missions: Map<string, MissionInfo>) {
  const { t } = useTranslation("agenda");
  return (slot: Pick<TemplateSlot, "kind" | "mission_id" | "location"> | undefined): string => {
    if (!slot) return t("empty");
    const what =
      slot.kind === "MISSION"
        ? slot.mission_id
          ? (missions.get(slot.mission_id)?.title ?? t("kinds.MISSION"))
          : t("templates.defaultMission")
        : t(`kinds.${slot.kind}`);
    return slot.location ? `${what} · ${t(`locations.${slot.location}`)}` : what;
  };
}
