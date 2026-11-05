import { Anchor, Button, Card, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useNotify } from "../directory/useNotify";
import {
  type HalfDay,
  type HalfDayKind,
  type WorkLocation,
  useAssign,
  useClear,
  useSubtypes,
} from "./api";
import { KINDS, LOCATIONS, WORKING_KINDS } from "./kinds";
import type { MissionInfo } from "./useLabels";
import type { useSelection } from "./useSelection";

interface AssignPanelProps {
  selection: ReturnType<typeof useSelection>;
  halfDays: Map<string, HalfDay>;
  missions: Map<string, MissionInfo>;
}

/** Gives the same values to the selected half-days (P4-9) or clears them. */
export function AssignPanel({ selection, halfDays, missions }: AssignPanelProps) {
  const { t, i18n } = useTranslation("agenda");
  const notify = useNotify();
  const assign = useAssign();
  const clear = useClear();
  const subtypes = useSubtypes();
  const [kind, setKind] = useState<HalfDayKind>("MISSION");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const [location, setLocation] = useState<WorkLocation | null>(null);
  const [note, setNote] = useState("");

  const slots = selection.slots;
  const first = slots[0]?.date;
  const last = slots[slots.length - 1]?.date;
  // RG-02: only missions covering the whole selection are offered.
  const eligible = [...missions.values()].filter(
    (m) => first && last && m.start <= first && (!m.end || m.end >= last),
  );
  const single =
    slots.length === 1 ? halfDays.get(`${slots[0]!.date}|${slots[0]!.period}`) : undefined;
  const singleMission = single?.mission_id ? missions.get(single.mission_id) : undefined;
  const kindSubtypes = (subtypes.data ?? []).filter((s) => s.kind === kind);
  const canApply = slots.length > 0 && (kind !== "MISSION" || missionId !== null);

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={5}>{t("assign.title")}</Title>
        <Text size="sm" c="dimmed">
          {slots.length ? t("assign.count", { count: slots.length }) : t("assign.hint")}
        </Text>
        {singleMission && (
          <Anchor component={Link} to={`/missions/${singleMission.id}`} size="sm">
            {t("assign.openMission", { title: singleMission.title })}
          </Anchor>
        )}
        <Select
          label={t("assign.kind")}
          allowDeselect={false}
          data={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          value={kind}
          onChange={(value) => {
            const next = value as HalfDayKind;
            setKind(next);
            setSubtypeId(null);
            if (next !== "MISSION") setMissionId(null);
            if (!WORKING_KINDS.includes(next)) setLocation(null);
          }}
        />
        {kind === "MISSION" && (
          <Select
            label={t("assign.mission")}
            placeholder={eligible.length ? undefined : t("assign.noMission")}
            data={eligible.map((m) => ({ value: m.id, label: m.title }))}
            value={missionId}
            onChange={setMissionId}
            clearable
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
        <TextInput
          label={t("assign.note")}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Group grow>
          <Button
            disabled={!canApply}
            loading={assign.isPending}
            onClick={() =>
              assign.mutate(
                {
                  slots,
                  kind,
                  mission_id: missionId,
                  subtype_id: subtypeId,
                  location,
                  note: note.trim() || null,
                },
                { onSuccess: selection.clear, onError: notify.error },
              )
            }
          >
            {t("assign.apply")}
          </Button>
        </Group>
        <Group grow>
          <Button variant="default" disabled={!slots.length} onClick={selection.clear}>
            {t("assign.unselect")}
          </Button>
          <Button
            variant="light"
            color="red"
            disabled={!slots.length}
            loading={clear.isPending}
            onClick={() =>
              clear.mutate(slots, { onSuccess: selection.clear, onError: notify.error })
            }
          >
            {t("assign.clear")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
