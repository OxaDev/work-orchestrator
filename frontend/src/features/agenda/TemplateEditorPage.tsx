import {
  Anchor,
  Breadcrumbs,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useNotify } from "../directory/useNotify";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import { type HalfDayKind, type Period, type WorkLocation, useSubtypes } from "./api";
import { PERIODS } from "./calendar";
import { halfDayBackground, KINDS, LOCATIONS, WORKING_KINDS } from "./kinds";
import {
  type TemplateSlot,
  type WeekTemplate,
  useUpdateTemplate,
  useWeekTemplate,
} from "./templatesApi";
import { useSlotText, useWeekdayNames, WEEKDAYS } from "./templateLabels";
import { useMissionIndex } from "./useLabels";

const slotKey = (weekday: number, period: Period) => `${weekday}|${period}`;

function Editor({ template }: { template: WeekTemplate }) {
  const { t, i18n } = useTranslation("agenda");
  const notify = useNotify();
  const update = useUpdateTemplate(template.id);
  const subtypes = useSubtypes();
  const missions = useMissionIndex();
  const slotText = useSlotText(missions);
  const weekdays = useWeekdayNames();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [missionId, setMissionId] = useState<string | null>(template.mission_id);
  const [slots, setSlots] = useState(
    () => new Map(template.slots.map((s) => [slotKey(s.weekday, s.period), s])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<HalfDayKind>("MISSION");
  const [slotMission, setSlotMission] = useState<string | null>(null);
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const [location, setLocation] = useState<WorkLocation | null>(null);
  const kindSubtypes = (subtypes.data ?? []).filter((s) => s.kind === kind);
  const missionOptions = [...missions.values()].map((m) => ({ value: m.id, label: m.title }));

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const fill = (values: Omit<TemplateSlot, "weekday" | "period"> | null) => {
    setSlots((current) => {
      const next = new Map(current);
      for (const key of selected) {
        const [weekday, period] = key.split("|");
        if (values)
          next.set(key, { weekday: Number(weekday), period: period as Period, ...values });
        else next.delete(key);
      }
      return next;
    });
    setSelected(new Set());
  };
  const save = () =>
    update.mutate(
      {
        name: name.trim(),
        description,
        mission_id: missionId,
        slots: [...slots.values()].sort((a, b) =>
          slotKey(a.weekday, a.period).localeCompare(slotKey(b.weekday, b.period)),
        ),
      },
      { onSuccess: notify.saved, onError: notify.error },
    );

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/agenda/templates">
          {t("templates.title")}
        </Anchor>
        <Text>{template.name}</Text>
      </Breadcrumbs>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack>
            <Group grow align="flex-start">
              <TextInput
                label={t("templates.name")}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={name.trim() ? null : t("validation.required")}
              />
              <Select
                label={t("templates.mission")}
                description={t("templates.missionHelp")}
                clearable
                data={missionOptions}
                value={missionId}
                onChange={setMissionId}
              />
            </Group>
            <Textarea
              label={t("templates.description")}
              autosize
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <Text size="sm" c="dimmed">
              {t("templates.gridHint")}
            </Text>
            <SimpleGrid cols={7} spacing={4} role="grid" aria-label={t("templates.grid")}>
              {WEEKDAYS.map((weekday) => (
                <Stack key={weekday} gap={4}>
                  <Text size="xs" fw={600} ta="center" tt="capitalize">
                    {weekdays[weekday]}
                  </Text>
                  {PERIODS.map((period) => {
                    const key = slotKey(weekday, period);
                    const slot = slots.get(key);
                    const color = slot?.mission_id
                      ? missions.get(slot.mission_id)?.color
                      : undefined;
                    const text = slotText(slot);
                    return (
                      <UnstyledButton
                        key={period}
                        aria-pressed={selected.has(key)}
                        aria-label={`${weekdays[weekday]}, ${t(`periods.${period}`)} : ${text}`}
                        title={text}
                        onClick={() => toggle(key)}
                        style={{
                          minHeight: 56,
                          borderRadius: 4,
                          padding: 4,
                          fontSize: 11,
                          overflow: "hidden",
                          color:
                            slot && ["MISSION", "INTERCONTRACT"].includes(slot.kind)
                              ? "white"
                              : undefined,
                          background: slot
                            ? halfDayBackground(slot.kind, color ?? "blue")
                            : "transparent",
                          border: slot
                            ? "1px solid transparent"
                            : "1px dashed var(--mantine-color-default-border)",
                          outline: selected.has(key)
                            ? "2px solid var(--mantine-color-blue-filled)"
                            : undefined,
                          outlineOffset: 1,
                        }}
                      >
                        {slot ? text : ""}
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              ))}
            </SimpleGrid>
            <Group>
              <Button onClick={save} loading={update.isPending} disabled={!name.trim()}>
                {t("templates.save")}
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder>
            <Stack gap="sm">
              <Title order={5}>{t("templates.fillTitle")}</Title>
              <Text size="sm" c="dimmed">
                {selected.size
                  ? t("assign.count", { count: selected.size })
                  : t("templates.fillHint")}
              </Text>
              <Select
                label={t("assign.kind")}
                allowDeselect={false}
                data={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
                value={kind}
                onChange={(value) => {
                  const next = value as HalfDayKind;
                  setKind(next);
                  setSubtypeId(null);
                  if (next !== "MISSION") setSlotMission(null);
                  if (!WORKING_KINDS.includes(next)) setLocation(null);
                }}
              />
              {kind === "MISSION" && (
                <Select
                  label={t("assign.mission")}
                  placeholder={t("templates.defaultMission")}
                  clearable
                  data={missionOptions}
                  value={slotMission}
                  onChange={setSlotMission}
                />
              )}
              {kindSubtypes.length > 0 && (
                <Select
                  label={t("assign.subtype")}
                  clearable
                  data={kindSubtypes.map((s) => ({
                    value: s.id,
                    label: i18n.language === "en" ? s.name_en : s.name_fr,
                  }))}
                  value={subtypeId}
                  onChange={setSubtypeId}
                />
              )}
              {WORKING_KINDS.includes(kind) && (
                <Select
                  label={t("assign.location")}
                  clearable
                  data={LOCATIONS.map((l) => ({ value: l, label: t(`locations.${l}`) }))}
                  value={location}
                  onChange={(v) => setLocation(v as WorkLocation | null)}
                />
              )}
              <Group grow>
                <Button
                  disabled={!selected.size}
                  onClick={() =>
                    fill({ kind, mission_id: slotMission, subtype_id: subtypeId, location })
                  }
                >
                  {t("assign.apply")}
                </Button>
                <Button
                  variant="light"
                  color="red"
                  disabled={!selected.size}
                  onClick={() => fill(null)}
                >
                  {t("assign.clear")}
                </Button>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/** /agenda/templates/:templateId — 7 × 2 grid editor (P6-6). */
export function TemplateEditorPage() {
  const { templateId = "" } = useParams();
  const template = useWeekTemplate(templateId);
  if (template.isPending) return <Loader size="sm" />;
  if (!template.data) return <NotFoundPage />;
  return <Editor key={template.data.id} template={template.data} />;
}
