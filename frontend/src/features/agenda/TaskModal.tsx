import {
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { IconArrowForward, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useContacts } from "../directory/api";
import { useNotify } from "../directory/useNotify";
import { subjectPaths, useSubjects } from "../subjects/api";
import { type Period, useHalfDays } from "./api";
import { PERIODS } from "./calendar";
import { canPlace } from "./micro";
import {
  type Task,
  type TaskKind,
  type TaskStatus,
  TASK_STATUSES,
  useCarryOver,
  useCompatibility,
  useCreateTask,
  useDeleteTask,
  useTaskError,
  useUpdateTask,
} from "./tasksApi";
import { useHalfDayLabels, useMissionIndex } from "./useLabels";

export interface TaskDefaults {
  date: string;
  period: Period;
  subjectId?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Participants picker: remote search, keeping the labels of already chosen contacts. */
function ParticipantsSelect({
  value,
  onChange,
  known,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  known: { id: string; name: string }[];
}) {
  const { t } = useTranslation("agenda");
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const contacts = useContacts({ q: debounced || undefined, limit: 20 });
  const [labels, setLabels] = useState(() => new Map(known.map((c) => [c.id, c.name])));
  const found = (contacts.data?.items ?? []).map((c) => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name}`,
  }));
  const data = [
    ...found,
    ...value
      .filter((id) => !found.some((option) => option.value === id))
      .map((id) => ({ value: id, label: labels.get(id) ?? id })),
  ];
  return (
    <MultiSelect
      label={t("task.participants")}
      searchable
      filter={({ options }) => options}
      searchValue={search}
      onSearchChange={setSearch}
      data={data}
      value={value}
      onChange={(ids) => {
        setLabels((current) => {
          const next = new Map(current);
          for (const option of data) next.set(option.value, option.label);
          return next;
        });
        onChange(ids);
      }}
    />
  );
}

/** Create or edit a task (P5-4); also the quick entry opened with `n` (P5-13). */
export function TaskModal({
  task,
  defaults,
  onClose,
}: {
  task?: Task;
  defaults?: TaskDefaults;
  onClose: () => void;
}) {
  const { t } = useTranslation("agenda");
  const notify = useNotify();
  const onError = useTaskError();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const carry = useCarryOver();
  const rules = useCompatibility();
  const subjects = useSubjects();
  const missions = useMissionIndex();
  const labels = useHalfDayLabels(missions);

  const form = useForm({
    initialValues: {
      date: task?.date ?? defaults?.date ?? "",
      period: (task?.period ?? defaults?.period ?? "AM") as Period,
      subject_id: task?.subject.id ?? defaults?.subjectId ?? null,
      title: task?.title ?? "",
      kind: (task?.kind ?? "TASK") as TaskKind,
      starts_at: task?.starts_at?.slice(0, 5) ?? "",
      duration_minutes: task?.duration_minutes ?? 60,
      status: (task?.status ?? "PLANNED") as TaskStatus,
      external_ref: task?.external_ref ?? "",
      description: task?.description ?? "",
      participant_ids: task?.participants.map((p) => p.id) ?? [],
    },
    validate: {
      date: (v) => (DATE.test(v) ? null : t("validation.required")),
      subject_id: (v) => (v ? null : t("validation.required")),
      title: (v) => (v.trim() ? null : t("validation.required")),
      duration_minutes: (v) =>
        typeof v === "number" && v >= 1 && v <= 720 ? null : t("task.durationRange"),
    },
  });

  const { date, period } = form.values;
  const validDate = DATE.test(date);
  const halfDays = useHalfDays(
    validDate ? date : "2000-01-01",
    validDate ? date : "2000-01-01",
    validDate,
  );
  const halfDay = validDate ? halfDays.data?.find((h) => h.period === period) : undefined;

  const options = (() => {
    const all = (subjects.data ?? []).filter((s) => !s.archived_at);
    const paths = subjectPaths(all);
    const groupOf = (s: (typeof all)[number]) =>
      s.scope === "MISSION"
        ? (missions.get(s.mission_id ?? "")?.title ?? t("kinds.MISSION"))
        : t(`scopes.${s.scope}`);
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const subject of all) {
      const keep = subject.id === task?.subject.id || canPlace(rules.data, halfDay, subject);
      if (!keep) continue;
      const group = groupOf(subject);
      groups.set(group, [
        ...(groups.get(group) ?? []),
        { value: subject.id, label: paths.get(subject.id)! },
      ]);
    }
    return [...groups].map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  })();

  const close = () => {
    notify.saved();
    onClose();
  };
  const submit = form.onSubmit((v) => {
    const common = {
      date: v.date,
      period: v.period,
      subject_id: v.subject_id!,
      kind: v.kind,
      title: v.title.trim(),
      starts_at: v.starts_at ? `${v.starts_at}:00` : null,
      duration_minutes: Number(v.duration_minutes),
      external_ref: v.external_ref.trim() || null,
      description: v.description,
      participant_ids: v.kind === "MEETING" ? v.participant_ids : [],
    };
    if (task) {
      update.mutate({ id: task.id, ...common, status: v.status }, { onSuccess: close, onError });
    } else {
      create.mutate({ ...common, status: "PLANNED" }, { onSuccess: close, onError });
    }
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={task ? t("task.editTitle") : t("task.createTitle")}
      size="lg"
    >
      <form noValidate onSubmit={submit}>
        <Stack>
          <Group grow align="flex-start">
            <TextInput type="date" label={t("task.date")} {...form.getInputProps("date")} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {t("task.period")}
              </Text>
              <SegmentedControl
                aria-label={t("task.period")}
                data={PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
                {...form.getInputProps("period")}
              />
            </Stack>
          </Group>
          {validDate && (
            <Text size="xs" c="dimmed">
              {halfDay
                ? t("task.halfDayIs", { content: labels.content(halfDay) })
                : t("task.halfDayEmpty")}
            </Text>
          )}
          <Select
            label={t("task.subject")}
            searchable
            nothingFoundMessage={t("task.noSubject")}
            data={options}
            {...form.getInputProps("subject_id")}
          />
          <TextInput label={t("task.title")} {...form.getInputProps("title")} data-autofocus />
          <Group grow align="flex-start">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {t("task.kind")}
              </Text>
              <SegmentedControl
                aria-label={t("task.kind")}
                data={(["TASK", "MEETING"] as const).map((k) => ({
                  value: k,
                  label: t(`taskKinds.${k}`),
                }))}
                {...form.getInputProps("kind")}
              />
            </Stack>
            <TextInput
              type="time"
              label={t("task.startsAt")}
              {...form.getInputProps("starts_at")}
            />
            <NumberInput
              label={t("task.duration")}
              min={1}
              max={720}
              step={15}
              {...form.getInputProps("duration_minutes")}
            />
          </Group>
          {task && (
            <Select
              label={t("task.status")}
              allowDeselect={false}
              data={TASK_STATUSES.map((s) => ({ value: s, label: t(`taskStatus.${s}`) }))}
              {...form.getInputProps("status")}
            />
          )}
          {form.values.kind === "MEETING" && (
            <ParticipantsSelect
              value={form.values.participant_ids}
              onChange={(ids) => form.setFieldValue("participant_ids", ids)}
              known={task?.participants ?? []}
            />
          )}
          <TextInput label={t("task.externalRef")} {...form.getInputProps("external_ref")} />
          <Textarea
            label={t("task.description")}
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Group justify="space-between">
            <Group gap="xs">
              {task && (
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  loading={remove.isPending}
                  onClick={() => remove.mutate(task.id, { onSuccess: close, onError })}
                >
                  {t("task.delete")}
                </Button>
              )}
              {task?.status === "PLANNED" && (
                <Button
                  variant="default"
                  leftSection={<IconArrowForward size={16} />}
                  loading={carry.isPending}
                  onClick={() => carry.mutate({ id: task.id }, { onSuccess: close, onError })}
                >
                  {t("task.carryOver")}
                </Button>
              )}
            </Group>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t("save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
