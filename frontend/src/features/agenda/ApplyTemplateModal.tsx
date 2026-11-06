import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { addDays } from "./calendar";
import { weekStart } from "./micro";
import {
  ACTION_COLORS,
  type ApplicationPlan,
  PLAN_ACTIONS,
  useApplyTemplate,
  usePreviewTemplate,
  useWeekTemplates,
} from "./templatesApi";
import { useSlotText, useWeekdayNames } from "./templateLabels";
import { useHalfDayLabels, useMissionIndex } from "./useLabels";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ApplyDefaults {
  templateId?: string | null;
  start: string;
  end: string;
}

/** Coloured preview, one row per week (P6-7). */
function PlanGrid({ plan }: { plan: ApplicationPlan }) {
  const { t } = useTranslation("agenda");
  const weekdays = useWeekdayNames("short");
  const missions = useMissionIndex();
  const labels = useHalfDayLabels(missions);
  const slotText = useSlotText(missions);
  const byKey = new Map(plan.items.map((item) => [`${item.date}|${item.period}`, item]));
  const weeks: string[] = [];
  for (let monday = weekStart(plan.start); monday <= plan.end; monday = addDays(monday, 7)) {
    weeks.push(monday);
  }
  return (
    <Stack gap={4} role="table" aria-label={t("templates.apply.previewLabel")}>
      <SimpleGrid cols={7} spacing={4} role="row">
        {weekdays.map((name) => (
          <Text key={name} size="xs" c="dimmed" ta="center" role="columnheader">
            {name}
          </Text>
        ))}
      </SimpleGrid>
      {weeks.map((monday) => (
        <SimpleGrid key={monday} cols={7} spacing={4} role="row">
          {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => (
            <Stack key={day} gap={2} role="cell">
              <Text size="xs" ta="center">
                {Number(day.slice(8))}
              </Text>
              {(["AM", "PM"] as const).map((period) => {
                const item = byKey.get(`${day}|${period}`);
                if (!item) return <Box key={period} h={14} />;
                const label = `${labels.day(day)}, ${t(`periods.${period}`)} : ${t(
                  `templates.actions.${item.action}`,
                )} — ${slotText(item)}`;
                return (
                  <Box
                    key={period}
                    h={14}
                    role="img"
                    aria-label={label}
                    title={label}
                    style={{
                      borderRadius: 3,
                      background: `var(--mantine-color-${ACTION_COLORS[item.action]}-${
                        item.action === "CREATE" || item.action === "OVERWRITE" ? 5 : 2
                      })`,
                    }}
                  />
                );
              })}
            </Stack>
          ))}
        </SimpleGrid>
      ))}
    </Stack>
  );
}

/**
 * Applies a week template on a range (P6-3, P6-4, P6-7): preview first, then apply.
 * Filled half-days are kept unless "overwrite" is on, which asks for confirmation (RG-10).
 */
export function ApplyTemplateModal({
  defaults,
  onClose,
}: {
  defaults: ApplyDefaults;
  onClose: () => void;
}) {
  const { t } = useTranslation("agenda");
  const errorMessage = useErrorMessage();
  const templates = useWeekTemplates();
  const missions = useMissionIndex();
  const preview = usePreviewTemplate();
  const apply = useApplyTemplate();
  const [templateId, setTemplateId] = useState<string | null>(defaults.templateId ?? null);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const list = templates.data ?? [];
  // Default: the requested template, else the first one.
  const template = list.find((tpl) => tpl.id === templateId) ?? list[0];
  const needsMission = (template?.slots ?? []).some((s) => s.kind === "MISSION" && !s.mission_id);
  const body = {
    start,
    end,
    strategy: overwrite ? ("OVERWRITE" as const) : ("SKIP" as const),
    mission_id: missionId ?? template?.mission_id ?? null,
  };
  const valid = Boolean(template) && DATE.test(start) && DATE.test(end) && start <= end;
  const plan = preview.data;
  const writes = (plan?.counts.CREATE ?? 0) + (plan?.counts.OVERWRITE ?? 0);
  const reset = () => preview.reset();

  const run = () =>
    apply.mutate(
      { id: template!.id, ...body },
      {
        onSuccess: (result) => {
          notifications.show({
            color: "teal",
            message: t("templates.apply.done", { count: result.applied }),
          });
          onClose();
        },
        onError: (error) => notifications.show({ color: "red", message: errorMessage(error) }),
      },
    );

  return (
    <Modal opened onClose={onClose} title={t("templates.apply.title")} size="xl">
      <Stack>
        {templates.data?.length === 0 ? (
          <Alert color="blue">{t("templates.apply.noTemplate")}</Alert>
        ) : (
          <Select
            label={t("templates.apply.template")}
            allowDeselect={false}
            data={(templates.data ?? []).map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            value={template?.id ?? null}
            onChange={(value) => {
              setTemplateId(value);
              setMissionId(null);
              reset();
            }}
          />
        )}
        <Group grow>
          <TextInput
            type="date"
            label={t("templates.apply.start")}
            value={start}
            onChange={(e) => {
              setStart(e.currentTarget.value);
              reset();
            }}
          />
          <TextInput
            type="date"
            label={t("templates.apply.end")}
            value={end}
            onChange={(e) => {
              setEnd(e.currentTarget.value);
              reset();
            }}
          />
        </Group>
        {needsMission && (
          <Select
            label={t("templates.apply.mission")}
            description={t("templates.apply.missionHelp")}
            clearable
            data={[...missions.values()].map((m) => ({ value: m.id, label: m.title }))}
            value={missionId ?? template?.mission_id ?? null}
            onChange={(value) => {
              setMissionId(value);
              reset();
            }}
          />
        )}
        <Switch
          label={t("templates.apply.overwrite")}
          description={t("templates.apply.overwriteHelp")}
          checked={overwrite}
          onChange={(e) => {
            setOverwrite(e.currentTarget.checked);
            reset();
          }}
        />
        {preview.isError && (
          <Alert color="red" role="alert">
            {errorMessage(preview.error)}
          </Alert>
        )}
        {plan && (
          <Stack gap="xs">
            <Group gap={6}>
              {PLAN_ACTIONS.filter((action) => plan.counts[action]).map((action) => (
                <Badge key={action} color={ACTION_COLORS[action]} variant="light">
                  {t("templates.actions.count", {
                    action: t(`templates.actions.${action}`),
                    count: plan.counts[action],
                  })}
                </Badge>
              ))}
            </Group>
            <ScrollArea.Autosize mah={360}>
              <PlanGrid plan={plan} />
            </ScrollArea.Autosize>
          </Stack>
        )}
        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={!valid}
            loading={preview.isPending}
            onClick={() => preview.mutate({ id: template!.id, ...body })}
          >
            {t("templates.apply.preview")}
          </Button>
          <Button
            disabled={!plan || writes === 0}
            loading={apply.isPending}
            onClick={() => ((plan?.counts.OVERWRITE ?? 0) > 0 ? setConfirming(true) : run())}
          >
            {t("templates.apply.confirm", { count: writes })}
          </Button>
        </Group>
      </Stack>
      <ConfirmDialog
        opened={confirming}
        title={t("templates.apply.overwriteTitle")}
        message={t("templates.apply.overwriteMessage", { count: plan?.counts.OVERWRITE ?? 0 })}
        loading={apply.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          run();
        }}
      />
    </Modal>
  );
}
