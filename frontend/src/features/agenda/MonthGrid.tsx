import { Box, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { HalfDay, Slot } from "./api";
import { isWeekend, monthWeeks, parse, PERIODS, todayIso } from "./calendar";
import { HalfDayCell } from "./HalfDayCell";
import type { MissionInfo } from "./useLabels";
import { useHalfDayLabels } from "./useLabels";
import type { useSelection } from "./useSelection";

interface MonthGridProps {
  year: number;
  month: number;
  halfDays: Map<string, HalfDay>;
  holidays: Map<string, string>;
  missions: Map<string, MissionInfo>;
  selection: ReturnType<typeof useSelection>;
  locked: boolean;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function MonthGrid({
  year,
  month,
  halfDays,
  holidays,
  missions,
  selection,
  locked,
}: MonthGridProps) {
  const { t, i18n } = useTranslation("agenda");
  const labels = useHalfDayLabels(missions);
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    timeZone: "UTC",
  });
  const today = todayIso();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <Box role="grid" aria-label={t("monthGrid")} aria-readonly={locked}>
      <SimpleGrid cols={7} spacing={4} mb={4} role="row">
        {WEEKDAYS.map((i) => (
          <Text key={i} size="xs" c="dimmed" ta="center" role="columnheader">
            {weekdayFormat.format(parse(`2024-01-0${i + 1}`))}
          </Text>
        ))}
      </SimpleGrid>
      <Stack gap={4}>
        {monthWeeks(year, month).map((week) => (
          <SimpleGrid key={week[0]} cols={7} spacing={4} role="row">
            {week.map((day) => {
              if (!day.startsWith(monthPrefix)) return <Box key={day} role="gridcell" />;
              const slots: Slot[] = PERIODS.map((period) => ({ date: day, period }));
              const holiday = holidays.get(day);
              return (
                <Box
                  key={day}
                  role="gridcell"
                  p={4}
                  style={{
                    borderRadius: 6,
                    border: `1px solid ${day === today ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
                    background: isWeekend(day) ? "var(--mantine-color-default-hover)" : undefined,
                    userSelect: "none",
                  }}
                >
                  <UnstyledButton
                    disabled={locked}
                    aria-label={t("selectDay", { day: labels.day(day) })}
                    onClick={() => selection.toggleDay(slots)}
                    style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
                  >
                    <Text size="xs" fw={day === today ? 700 : 500}>
                      {Number(day.slice(8))}
                    </Text>
                    {holiday && (
                      <Text size="xs" c="red" truncate maw="75%" title={holiday}>
                        {holiday}
                      </Text>
                    )}
                  </UnstyledButton>
                  <Stack gap={2} mt={2}>
                    {slots.map((slot) => {
                      const halfDay = halfDays.get(`${slot.date}|${slot.period}`);
                      const mission = halfDay?.mission_id
                        ? missions.get(halfDay.mission_id)
                        : undefined;
                      return (
                        <HalfDayCell
                          key={slot.period}
                          halfDay={halfDay}
                          missionColor={mission?.color}
                          text={
                            halfDay?.kind === "MISSION" ? mission?.title : labels.content(halfDay)
                          }
                          label={labels.slot(slot.date, slot.period, halfDay)}
                          selected={selection.isSelected(slot)}
                          disabled={locked}
                          onPointerDown={(event) => selection.pointerDown(slot, event.shiftKey)}
                          onPointerEnter={() => selection.pointerEnter(slot)}
                          onKeyboardSelect={(shift) => selection.keyboard(slot, shift)}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
          </SimpleGrid>
        ))}
      </Stack>
    </Box>
  );
}
