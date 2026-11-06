import { Anchor, Badge, Box, Group, Loader, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { todayIso } from "../agenda/calendar";
import { formatDate } from "../missions/format";
import { useCareer } from "./api";

const DAY = 86_400_000;
const time = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

/**
 * /missions/career — every mission on one time axis (P10-5, Q-K3). Each bar wears its mission's
 * colour and its name is always written beside it: identity never relies on colour alone.
 */
export function CareerPage() {
  const { t, i18n } = useTranslation("dashboard");
  const career = useCareer();
  if (!career.data) return <Loader size="sm" />;
  const entries = career.data.missions;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const days = (value: number) => t("days", { count: value, value: number.format(value) });
  const today = todayIso();
  const endOf = (m: (typeof entries)[number]["mission"]) =>
    m.actual_end_date ?? m.planned_end_date ?? today;
  const first = entries.length ? Math.min(...entries.map((e) => time(e.mission.start_date))) : 0;
  const last = entries.length
    ? Math.max(...entries.map((e) => time(endOf(e.mission))), time(today))
    : 0;
  const startYear = new Date(first).getUTCFullYear();
  const endYear = new Date(last).getUTCFullYear() + 1;
  const from = Date.UTC(startYear, 0, 1);
  const span = Date.UTC(endYear, 0, 1) - from || DAY;
  const at = (ms: number) => `${(100 * (ms - from)) / span}%`;
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("career.title")}</Title>
        <Anchor component={Link} to="/missions" size="sm">
          {t("career.back")}
        </Anchor>
      </Group>
      {entries.length === 0 ? (
        <Text c="dimmed">{t("career.empty")}</Text>
      ) : (
        <Stack gap="md" role="list" aria-label={t("career.title")}>
          <Box pos="relative" h={18} ml={240} aria-hidden>
            {years.map((year) => (
              <Text
                key={year}
                size="xs"
                c="dimmed"
                pos="absolute"
                style={{ left: at(Date.UTC(year, 0, 1)), transform: "translateX(-50%)" }}
              >
                {year}
              </Text>
            ))}
          </Box>
          {entries.map(({ mission, days: totalDays, technologies }) => {
            const start = time(mission.start_date);
            const end = time(endOf(mission)) + DAY;
            const period = `${formatDate(mission.start_date, i18n.language)} – ${
              mission.actual_end_date || mission.planned_end_date
                ? formatDate(endOf(mission), i18n.language)
                : t("career.ongoing")
            }`;
            return (
              <Group key={mission.id} gap={0} wrap="nowrap" align="flex-start" role="listitem">
                <Box w={240} pr="sm">
                  <Anchor component={Link} to={`/missions/${mission.id}`} size="sm" fw={600}>
                    {mission.title}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {mission.client.name} · {days(totalDays)}
                  </Text>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Box
                    pos="relative"
                    h={14}
                    style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
                  >
                    <Tooltip label={`${period} · ${days(totalDays)}`}>
                      <Box
                        pos="absolute"
                        top={2}
                        h={10}
                        aria-label={`${mission.title} : ${period}`}
                        style={{
                          left: at(start),
                          width: `max(4px, ${(100 * (end - start)) / span}%)`,
                          background: `var(--mantine-color-${mission.color}-6)`,
                          borderRadius: 4,
                        }}
                      />
                    </Tooltip>
                  </Box>
                  <Group gap={4} mt={4} style={{ paddingLeft: at(start) }}>
                    {technologies.map((tech) => (
                      <Badge key={tech.technology.id} size="xs" variant="light" color="gray">
                        {tech.technology.name}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
