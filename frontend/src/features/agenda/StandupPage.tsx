import {
  ActionIcon,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowForward, IconCheck, IconCopy, IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { AgendaViews } from "./AgendaViews";
import { todayIso } from "./calendar";
import { DailyLogForm } from "./DailyLogForm";
import { standupText } from "./micro";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import {
  type Task,
  type TaskStatus,
  useCarryOver,
  useStandup,
  useTaskError,
  useUpdateTask,
} from "./tasksApi";
import { useHalfDayLabels, useMissionIndex } from "./useLabels";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Yesterday's planned tasks get one of three outcomes (P5-12). */
function Outcome({ task, today }: { task: Task; today: string }) {
  const { t } = useTranslation("agenda");
  const update = useUpdateTask();
  const carry = useCarryOver();
  const onError = useTaskError();
  const set = (status: TaskStatus) => update.mutate({ id: task.id, status }, { onError });
  if (task.status !== "PLANNED") return null;
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={t("standup.markDone")}>
        <ActionIcon
          color="teal"
          variant="light"
          aria-label={t("standup.markDoneOf", { title: task.title })}
          loading={update.isPending}
          onClick={() => set("DONE")}
        >
          <IconCheck size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t("standup.carry")}>
        <ActionIcon
          color="orange"
          variant="light"
          aria-label={t("standup.carryOf", { title: task.title })}
          loading={carry.isPending}
          onClick={() => carry.mutate({ id: task.id, notBefore: today }, { onError })}
        >
          <IconArrowForward size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t("standup.cancel")}>
        <ActionIcon
          color="gray"
          variant="light"
          aria-label={t("standup.cancelOf", { title: task.title })}
          onClick={() => set("CANCELLED")}
        >
          <IconX size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/**
 * Morning screen (P5-12): settle yesterday's tasks, plan today, copy the standup text.
 * `?date=` shows the standup of another day.
 */
export function StandupPage() {
  const { t } = useTranslation("agenda");
  const [params] = useSearchParams();
  const requested = params.get("date");
  const today = requested && DATE.test(requested) ? requested : todayIso();
  const standup = useStandup(today);
  const missions = useMissionIndex();
  const labels = useHalfDayLabels(missions);
  const [modal, setModal] = useState<{ task?: Task; create?: boolean } | null>(null);

  if (!standup.data) return <Loader />;
  const data = standup.data;
  const text = standupText(data, {
    yesterday: (day) =>
      day ? t("standup.text.yesterday", { day: labels.day(day) }) : t("standup.text.before"),
    today: t("standup.text.today"),
    blockers: t("standup.text.blockers"),
    nothing: t("standup.text.nothing"),
    none: t("standup.text.none"),
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: "teal", message: t("standup.copied") });
    } catch {
      notifications.show({ color: "red", message: t("standup.copyFailed") });
    }
  };
  const open = (task: Task) => setModal({ task });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("standup.title", { day: labels.day(today) })}</Title>
        <AgendaViews date={today} current="standup" />
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            <Card withBorder>
              <Title order={5} mb="xs">
                {data.previous_day
                  ? t("standup.previous", { day: labels.day(data.previous_day) })
                  : t("standup.noPrevious")}
              </Title>
              <Stack gap={6}>
                {data.previous.map((task) => (
                  <Group key={task.id} gap="xs" wrap="nowrap" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <TaskCard task={task} onOpen={open} />
                    </div>
                    <Outcome task={task} today={today} />
                  </Group>
                ))}
              </Stack>
            </Card>
            <Card withBorder>
              <Group justify="space-between" mb="xs">
                <Title order={5}>{t("standup.today")}</Title>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setModal({ create: true })}
                >
                  {t("standup.plan")}
                </Button>
              </Group>
              {data.today.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("standup.nothingPlanned")}
                </Text>
              ) : (
                <Stack gap={6}>
                  {data.today.map((task) => (
                    <TaskCard key={task.id} task={task} onOpen={open} />
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            <DailyLogForm key={data.log.date} log={data.log} />
            <Card withBorder>
              <Group justify="space-between" mb="xs">
                <Title order={5}>{t("standup.textTitle")}</Title>
                <Button size="xs" leftSection={<IconCopy size={14} />} onClick={() => void copy()}>
                  {t("standup.copy")}
                </Button>
              </Group>
              <Textarea
                readOnly
                autosize
                minRows={6}
                aria-label={t("standup.textTitle")}
                value={text}
                styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
              />
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
      {modal && (
        <TaskModal
          task={modal.task}
          defaults={
            modal.create
              ? { date: today, period: new Date().getHours() < 13 ? "AM" : "PM" }
              : undefined
          }
          onClose={() => setModal(null)}
        />
      )}
    </Stack>
  );
}
