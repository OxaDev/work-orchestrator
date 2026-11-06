import { Button, Card, Group, Stack, Textarea, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { useNotify } from "../directory/useNotify";
import { type DailyLog, useSaveDailyLog } from "./tasksApi";

const SECTIONS = ["done", "planned", "blockers"] as const;

/** The day's note in three Markdown sections (Q-G1), editable even in a locked month. */
export function DailyLogForm({
  log,
  sections = SECTIONS,
}: {
  log: DailyLog;
  sections?: readonly (typeof SECTIONS)[number][];
}) {
  const { t } = useTranslation("agenda");
  const notify = useNotify();
  const save = useSaveDailyLog(log.date);
  const form = useForm({
    initialValues: { done: log.done, planned: log.planned, blockers: log.blockers },
  });
  return (
    <Card withBorder>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(values, {
            onSuccess: () => {
              form.resetDirty(values);
              notify.saved();
            },
            onError: notify.error,
          }),
        )}
      >
        <Stack gap="sm">
          <Title order={5}>{t("log.title")}</Title>
          {sections.map((section) => (
            <Textarea
              key={section}
              label={t(`log.${section}`)}
              autosize
              minRows={2}
              {...form.getInputProps(section)}
            />
          ))}
          <Group justify="flex-end">
            <Button type="submit" size="xs" loading={save.isPending} disabled={!form.isDirty()}>
              {t("log.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
