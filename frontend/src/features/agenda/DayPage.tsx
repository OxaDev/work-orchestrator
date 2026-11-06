import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { NotFoundPage } from "../placeholder/NotFoundPage";
import { useHalfDays, useHolidayGeneration } from "./api";
import { AgendaViews } from "./AgendaViews";
import { addDays, iso, parse, PERIODS, todayIso } from "./calendar";
import { MissionArchitectureLinks, TaskDomainLinks } from "./CrossLinks";
import { DailyLogForm } from "./DailyLogForm";
import { formatDuration, HALF_DAY_MINUTES } from "./duration";
import { countedMinutes, dayPath, subjectLink } from "./micro";
import { TaskCard } from "./TaskCard";
import { type TaskDefaults, TaskModal } from "./TaskModal";
import { type Task, useDailyLog, useTasks } from "./tasksApi";
import { useHalfDayLabels, useMissionIndex } from "./useLabels";

function DayView({ day }: { day: string }) {
  const { t } = useTranslation("agenda");
  const { ready } = useHolidayGeneration(Number(day.slice(0, 4)));
  const halfDays = useHalfDays(day, day, ready);
  const tasks = useTasks(day, day, ready);
  const log = useDailyLog(day);
  const missions = useMissionIndex();
  const labels = useHalfDayLabels(missions);
  const [modal, setModal] = useState<{ task?: Task; defaults?: TaskDefaults } | null>(null);
  const total = countedMinutes(tasks.data ?? []);

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            component={Link}
            to={dayPath(addDays(day, -1))}
            aria-label={t("day.previous")}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Title order={2} tt="capitalize">
            {labels.day(day)}
          </Title>
          <ActionIcon
            variant="default"
            component={Link}
            to={dayPath(addDays(day, 1))}
            aria-label={t("day.next")}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button component={Link} to={dayPath(todayIso())} variant="default" size="xs">
            {t("today")}
          </Button>
        </Group>
        <AgendaViews date={day} current="day" />
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            {PERIODS.map((period) => {
              const halfDay = halfDays.data?.find((h) => h.period === period);
              const slotTasks = (tasks.data ?? []).filter((task) => task.period === period);
              const minutes = countedMinutes(slotTasks);
              const mission = halfDay?.mission_id ? missions.get(halfDay.mission_id) : undefined;
              return (
                <Card key={period} withBorder>
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <Title order={5} tt="capitalize">
                        {t(`periods.${period}`)}
                      </Title>
                      <Text size="sm" c="dimmed">
                        {labels.content(halfDay)}
                      </Text>
                      {mission && (
                        <Anchor component={Link} to={`/missions/${mission.id}`} size="sm">
                          {t("day.openMission")}
                        </Anchor>
                      )}
                    </Group>
                    <Group gap="xs">
                      <Text size="sm" aria-label={t("day.periodTotal")}>
                        {formatDuration(minutes)}
                      </Text>
                      {minutes > HALF_DAY_MINUTES && (
                        <Badge size="sm" color="orange" variant="light">
                          {t("overbooked")}
                        </Badge>
                      )}
                      <ActionIcon
                        variant="light"
                        aria-label={t("task.addIn", {
                          slot: `${labels.day(day)}, ${t(`periods.${period}`)}`,
                        })}
                        onClick={() => setModal({ defaults: { date: day, period } })}
                      >
                        <IconPlus size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  {mission && <MissionArchitectureLinks missionId={mission.id} />}
                  {slotTasks.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      {t("day.noTask")}
                    </Text>
                  ) : (
                    <Stack gap={6}>
                      {slotTasks.map((task) => (
                        <Group key={task.id} gap="xs" wrap="nowrap" align="flex-start">
                          <div style={{ flex: 1 }}>
                            <TaskCard task={task} onOpen={(opened) => setModal({ task: opened })} />
                          </div>
                          <Stack gap={2} mt={4} maw="40%">
                            <Anchor component={Link} to={subjectLink(task.subject)} size="xs">
                              {t("day.subject", { title: task.subject.title })}
                            </Anchor>
                            <TaskDomainLinks task={task} />
                          </Stack>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Card>
              );
            })}
            <Text size="sm" fw={500}>
              {t("day.total", { duration: formatDuration(total) })}
            </Text>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          {log.data ? <DailyLogForm key={log.data.date} log={log.data} /> : <Loader size="sm" />}
        </Grid.Col>
      </Grid>
      {modal && (
        <TaskModal task={modal.task} defaults={modal.defaults} onClose={() => setModal(null)} />
      )}
    </Stack>
  );
}

/** /agenda/:year/:month/:day */
export function DayPage() {
  const params = useParams();
  const [year, month, dayOfMonth] = [params.year, params.month, params.day].map(Number);
  const valid =
    Number.isInteger(year) &&
    year! >= 2000 &&
    year! <= 2100 &&
    Number.isInteger(month) &&
    Number.isInteger(dayOfMonth);
  const day = valid ? iso(year!, month!, dayOfMonth!) : "";
  // Rejects 2026/2/31 and friends: the normalised date must match the URL.
  if (!valid || parse(day).getUTCMonth() + 1 !== month || parse(day).getUTCDate() !== dayOfMonth) {
    return <NotFoundPage />;
  }
  return <DayView key={day} day={day} />;
}
