import { Badge, Group, Paper, Text, UnstyledButton } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "./duration";
import { type Task, TASK_STATUS_COLORS } from "./tasksApi";

export const TASK_DRAG_TYPE = "application/x-wo-task";

/** Compact task card; draggable between half-days in the week view (P5-10). */
export function TaskCard({
  task,
  onOpen,
  draggable = false,
  onDragStart,
  onDragEnd,
  dimmed = false,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  draggable?: boolean;
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
  /** Outside the agenda's subject or domain filter (P10-6). */
  dimmed?: boolean;
}) {
  const { t } = useTranslation("agenda");
  const inactive = task.status === "CANCELLED" || task.status === "CARRIED_OVER";
  return (
    <Paper
      withBorder
      p={4}
      radius="sm"
      draggable={draggable}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(task);
      }}
      onDragEnd={onDragEnd}
      style={{ cursor: draggable ? "grab" : undefined, opacity: dimmed ? 0.3 : inactive ? 0.6 : 1 }}
    >
      <UnstyledButton
        w="100%"
        onClick={() => onOpen(task)}
        aria-label={t("task.open", {
          title: task.title,
          subject: task.subject.title,
          duration: formatDuration(task.duration_minutes),
          status: t(`taskStatus.${task.status}`),
        })}
      >
        <Text size="xs" fw={600} lineClamp={2} td={inactive ? "line-through" : undefined}>
          {task.starts_at && `${task.starts_at.slice(0, 5)} · `}
          {task.title}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {task.subject.title}
        </Text>
        <Group gap={4} mt={2} wrap="nowrap">
          <Text size="xs">{formatDuration(task.duration_minutes)}</Text>
          {task.kind === "MEETING" && <IconUsers size={12} aria-hidden />}
          {task.status !== "PLANNED" && (
            <Badge size="xs" variant="light" color={TASK_STATUS_COLORS[task.status]}>
              {t(`taskStatus.${task.status}`)}
            </Badge>
          )}
        </Group>
      </UnstyledButton>
    </Paper>
  );
}
