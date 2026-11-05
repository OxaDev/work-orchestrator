import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useMissions } from "../missions/api";
import type { HalfDay, Period } from "./api";
import { parse } from "./calendar";

export interface MissionInfo {
  id: string;
  title: string;
  color: string;
  start: string;
  end: string | null;
}

/** All the user's missions (archived included: they appear in past months), by id. */
export function useMissionIndex(): Map<string, MissionInfo> {
  const missions = useMissions({ include_archived: true, limit: 200 });
  return useMemo(
    () =>
      new Map(
        (missions.data?.items ?? []).map((m) => [
          m.id,
          {
            id: m.id,
            title: m.title,
            color: m.color,
            start: m.start_date,
            end: m.actual_end_date ?? m.planned_end_date,
          },
        ]),
      ),
    [missions.data],
  );
}

/** Human labels for dates and half-days, used for display and accessible names. */
export function useHalfDayLabels(missions: Map<string, MissionInfo>) {
  const { t, i18n } = useTranslation("agenda");
  return useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat(i18n.language, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    const content = (halfDay: HalfDay | undefined): string => {
      if (!halfDay) return t("empty");
      if (halfDay.kind === "MISSION") {
        return missions.get(halfDay.mission_id ?? "")?.title ?? t("kinds.MISSION");
      }
      return t(`kinds.${halfDay.kind}`);
    };
    return {
      day: (isoDate: string) => dayFormat.format(parse(isoDate)),
      period: (period: Period) => t(`periods.${period}`),
      content,
      slot: (isoDate: string, period: Period, halfDay: HalfDay | undefined) =>
        `${dayFormat.format(parse(isoDate))}, ${t(`periods.${period}`)} : ${content(halfDay)}`,
    };
  }, [t, i18n.language, missions]);
}
