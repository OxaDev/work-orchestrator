import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconLock } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { NotFoundPage } from "../placeholder/NotFoundPage";
import {
  type HalfDay,
  useHolidayGeneration,
  useHalfDays,
  usePublicHolidays,
  useStats,
  useYearLocks,
} from "./api";
import { iso, isWeekend, monthWeeks, parseYearMonth, PERIODS } from "./calendar";
import { halfDayBackground } from "./kinds";
import { Legend } from "./Legend";
import { type MissionInfo, useHalfDayLabels, useMissionIndex } from "./useLabels";

function MiniMonth({
  year,
  month,
  halfDays,
  holidays,
  missions,
  locked,
}: {
  year: number;
  month: number;
  halfDays: Map<string, HalfDay>;
  holidays: Map<string, string>;
  missions: Map<string, MissionInfo>;
  locked: boolean;
}) {
  const { t, i18n } = useTranslation("agenda");
  const labels = useHalfDayLabels(missions);
  const name = new Intl.DateTimeFormat(i18n.language, { month: "long", timeZone: "UTC" }).format(
    new Date(`${iso(year, month, 1)}T00:00:00Z`),
  );
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <Card withBorder padding="xs">
      <Group justify="space-between" mb={6}>
        <Anchor
          component={Link}
          to={`/agenda/${year}/${month}`}
          fw={600}
          style={{ textTransform: "capitalize" }}
        >
          {name}
        </Anchor>
        {locked && <IconLock size={14} aria-label={t("lock.locked")} />}
      </Group>
      <Stack gap={2}>
        {monthWeeks(year, month).map((week) => (
          <SimpleGrid key={week[0]} cols={7} spacing={2}>
            {week.map((day) => {
              if (!day.startsWith(prefix)) return <Box key={day} />;
              const parts = PERIODS.map((period) => halfDays.get(`${day}|${period}`));
              const label = `${labels.day(day)}${holidays.has(day) ? ` (${holidays.get(day)})` : ""} — ${PERIODS.map(
                (period, i) => `${labels.period(period)} : ${labels.content(parts[i])}`,
              ).join(", ")}`;
              return (
                <Box
                  key={day}
                  role="img"
                  aria-label={label}
                  title={label}
                  h={16}
                  style={{
                    display: "grid",
                    gridTemplateRows: "1fr 1fr",
                    gap: 1,
                    borderRadius: 2,
                    outline: isWeekend(day)
                      ? "1px solid var(--mantine-color-default-border)"
                      : undefined,
                    opacity: isWeekend(day) && !parts[0] && !parts[1] ? 0.4 : 1,
                  }}
                >
                  {parts.map((part, i) => (
                    <Box
                      key={PERIODS[i]}
                      style={{
                        borderRadius: 1,
                        background: part
                          ? halfDayBackground(part.kind, missions.get(part.mission_id ?? "")?.color)
                          : "var(--mantine-color-default-hover)",
                      }}
                    />
                  ))}
                </Box>
              );
            })}
          </SimpleGrid>
        ))}
      </Stack>
    </Card>
  );
}

function YearView({ year }: { year: number }) {
  const { t } = useTranslation("agenda");
  const from = iso(year, 1, 1);
  const to = iso(year, 12, 31);
  const { ready } = useHolidayGeneration(year);
  const halfDays = useHalfDays(from, to, ready);
  const holidays = usePublicHolidays(year);
  const locks = useYearLocks(year);
  const stats = useStats(from, to, ready);
  const missions = useMissionIndex();
  const halfDayMap = useMemo(
    () => new Map((halfDays.data ?? []).map((h) => [`${h.date}|${h.period}`, h])),
    [halfDays.data],
  );
  const holidayMap = useMemo(
    () => new Map((holidays.data ?? []).map((h) => [h.date, h.name])),
    [holidays.data],
  );
  const lockedMonths = new Set((locks.data ?? []).filter((m) => m.locked).map((m) => m.month));

  return (
    <Stack>
      <Group gap="xs">
        <ActionIcon
          variant="default"
          component={Link}
          to={`/agenda/${year - 1}`}
          aria-label={t("previousYear")}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
        <Title order={2}>{year}</Title>
        <ActionIcon
          variant="default"
          component={Link}
          to={`/agenda/${year + 1}`}
          aria-label={t("nextYear")}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <MiniMonth
                key={month}
                year={year}
                month={month}
                halfDays={halfDayMap}
                holidays={holidayMap}
                missions={missions}
                locked={lockedMonths.has(month)}
              />
            ))}
          </SimpleGrid>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <Card withBorder>
            <Stack gap="sm">
              <Title order={5}>{t("recap.yearTitle", { year })}</Title>
              {stats.data && (
                <Text size="sm">
                  {t("recap.filled", {
                    filled: stats.data.filled_days,
                    working: stats.data.working_days,
                  })}
                </Text>
              )}
              <Legend stats={stats.data} />
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export function AgendaYearPage() {
  const params = useParams();
  const parsed = parseYearMonth(params.year);
  if (!parsed) return <NotFoundPage />;
  return <YearView year={parsed.year} />;
}
