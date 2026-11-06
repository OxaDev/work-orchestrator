import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { type DragEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { subtreeIds } from "../../components/tree";
import { useSubjects } from "../subjects/api";

import { NotFoundPage } from "../placeholder/NotFoundPage";
import { type HalfDay, type Period, useHalfDays, useHolidayGeneration } from "./api";
import { AgendaViews } from "./AgendaViews";
import { addDays, isWeekend, PERIODS, todayIso } from "./calendar";
import { formatDuration, HALF_DAY_MINUTES } from "./duration";
import { halfDayBackground } from "./kinds";
import { canPlace, countedMinutes, dayPath, weekStart } from "./micro";
import { TASK_DRAG_TYPE, TaskCard } from "./TaskCard";
import { type TaskDefaults, TaskModal } from "./TaskModal";
import { type Task, useCompatibility, useTaskError, useTasks, useUpdateTask } from "./tasksApi";
import { useHalfDayLabels, useMissionIndex } from "./useLabels";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function WeekView({ monday }: { monday: string }) {
  const { t, i18n } = useTranslation("agenda");
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6]!;
  const { ready } = useHolidayGeneration(Number(monday.slice(0, 4)));
  const halfDays = useHalfDays(monday, sunday, ready);
  const tasks = useTasks(monday, sunday, ready);
  const rules = useCompatibility();
  const missions = useMissionIndex();
  const labels = useHalfDayLabels(missions);
  const move = useUpdateTask();
  const onError = useTaskError();
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [modal, setModal] = useState<{ task?: Task; defaults?: TaskDefaults } | null>(null);
  const today = todayIso();
  // ?subject= (with its sub-subjects) or ?domain= highlight matching tasks (P10-6, ADR-0039).
  const [params] = useSearchParams();
  const subjectFilter = params.get("subject");
  const domainFilter = params.get("domain");
  const subjects = useSubjects({ include_archived: true });
  const filterSubjects = subjectFilter ? subtreeIds(subjects.data ?? [], subjectFilter) : null;
  const inFilter = (task: Task) =>
    filterSubjects
      ? filterSubjects.has(task.subject.id)
      : domainFilter
        ? task.domains.some((d) => d.id === domainFilter)
        : true;
  const filterName = subjectFilter
    ? subjects.data?.find((s) => s.id === subjectFilter)?.title
    : domainFilter
      ? (tasks.data ?? []).flatMap((task) => task.domains).find((d) => d.id === domainFilter)?.name
      : undefined;

  const halfDayMap = useMemo(
    () => new Map((halfDays.data ?? []).map((h) => [`${h.date}|${h.period}`, h])),
    [halfDays.data],
  );
  const tasksBySlot = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks.data ?? []) {
      const key = `${task.date}|${task.period}`;
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks.data]);
  const headerFormat = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const titleFormat = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const accepts = (halfDay: HalfDay | undefined, slotDate: string, period: Period) =>
    dragging !== null &&
    `${dragging.date}|${dragging.period}` !== `${slotDate}|${period}` &&
    canPlace(rules.data, halfDay, dragging.subject);

  const drop = (event: DragEvent, slotDate: string, period: Period) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(TASK_DRAG_TYPE) || dragging?.id;
    setOver(null);
    setDragging(null);
    if (!id) return;
    move.mutate({ id, date: slotDate, period }, { onError });
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            component={Link}
            to={`/agenda/week/${addDays(monday, -7)}`}
            aria-label={t("week.previous")}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Title order={2}>
            {t("week.title", {
              start: titleFormat.format(new Date(`${monday}T00:00:00Z`)),
            })}
          </Title>
          <ActionIcon
            variant="default"
            component={Link}
            to={`/agenda/week/${addDays(monday, 7)}`}
            aria-label={t("week.next")}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button
            component={Link}
            to={`/agenda/week/${weekStart(today)}`}
            variant="default"
            size="xs"
          >
            {t("today")}
          </Button>
        </Group>
        <AgendaViews date={monday <= today && today <= sunday ? today : monday} current="week" />
      </Group>
      {(subjectFilter || domainFilter) && (
        <Alert color="blue" variant="light">
          <Group justify="space-between">
            <Text size="sm">
              {t(subjectFilter ? "week.filterSubject" : "week.filterDomain", {
                name: filterName ?? "…",
              })}
            </Text>
            <Anchor component={Link} to={`/agenda/week/${monday}`} size="sm">
              {t("week.clearFilter")}
            </Anchor>
          </Group>
        </Alert>
      )}
      <Text size="sm" c="dimmed">
        {t("week.hint")}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 4, lg: 7 }} spacing="xs">
        {days.map((day) => (
          <Stack
            key={day}
            gap={4}
            p={4}
            style={{
              borderRadius: 6,
              border: `1px solid ${day === today ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
              background: isWeekend(day) ? "var(--mantine-color-default-hover)" : undefined,
            }}
          >
            <Anchor component={Link} to={dayPath(day)} size="sm" fw={600} tt="capitalize">
              {headerFormat.format(new Date(`${day}T00:00:00Z`))}
            </Anchor>
            {PERIODS.map((period) => {
              const key = `${day}|${period}`;
              const halfDay = halfDayMap.get(key);
              const slotTasks = tasksBySlot.get(key) ?? [];
              const minutes = countedMinutes(slotTasks);
              const allowed = accepts(halfDay, day, period);
              const mission = halfDay?.mission_id ? missions.get(halfDay.mission_id) : undefined;
              return (
                <Box
                  key={period}
                  role="region"
                  aria-label={labels.slot(day, period, halfDay)}
                  data-drop={dragging ? (allowed ? "allowed" : "forbidden") : undefined}
                  onDragOver={(event) => {
                    if (!allowed) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOver(key);
                  }}
                  onDragLeave={() => setOver((current) => (current === key ? null : current))}
                  onDrop={(event) => (allowed ? drop(event, day, period) : undefined)}
                  p={4}
                  style={{
                    minHeight: 90,
                    borderRadius: 4,
                    outline:
                      over === key
                        ? "2px solid var(--mantine-color-blue-filled)"
                        : dragging && !allowed
                          ? "1px dashed var(--mantine-color-red-4)"
                          : undefined,
                    opacity: dragging && !allowed ? 0.55 : 1,
                  }}
                >
                  <Group justify="space-between" gap={4} wrap="nowrap" mb={4}>
                    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Box
                        w={10}
                        h={10}
                        style={{
                          flexShrink: 0,
                          borderRadius: 2,
                          background: halfDay
                            ? halfDayBackground(halfDay.kind, mission?.color)
                            : "transparent",
                          border: "1px solid var(--mantine-color-default-border)",
                        }}
                      />
                      <Text size="xs" c="dimmed" truncate>
                        {t(`periods.${period}`)} · {labels.content(halfDay)}
                      </Text>
                    </Group>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      aria-label={t("task.addIn", {
                        slot: `${labels.day(day)}, ${t(`periods.${period}`)}`,
                      })}
                      onClick={() => setModal({ defaults: { date: day, period } })}
                    >
                      <IconPlus size={12} />
                    </ActionIcon>
                  </Group>
                  <Stack gap={4}>
                    {slotTasks.map((task) => (
                      <TaskCard
                        dimmed={!inFilter(task)}
                        key={task.id}
                        task={task}
                        draggable
                        onOpen={(opened) => setModal({ task: opened })}
                        onDragStart={setDragging}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                      />
                    ))}
                  </Stack>
                  {minutes > 0 && (
                    <Group gap={4} mt={4}>
                      <Text size="xs" c="dimmed">
                        {formatDuration(minutes)}
                      </Text>
                      {minutes > HALF_DAY_MINUTES && (
                        <Badge size="xs" color="orange" variant="light">
                          {t("overbooked")}
                        </Badge>
                      )}
                    </Group>
                  )}
                </Box>
              );
            })}
          </Stack>
        ))}
      </SimpleGrid>
      {modal && (
        <TaskModal task={modal.task} defaults={modal.defaults} onClose={() => setModal(null)} />
      )}
    </Stack>
  );
}

/** /agenda/week/:date — any date of the week; the view starts on Monday. */
export function WeekPage() {
  const { date } = useParams();
  if (!date || !DATE.test(date) || Number.isNaN(Date.parse(date))) return <NotFoundPage />;
  const monday = weekStart(date);
  return <WeekView key={monday} monday={monday} />;
}
