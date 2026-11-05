import { Box, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { HalfDayKind, Stats } from "./api";
import { halfDayBackground, KINDS } from "./kinds";

export function Swatch({ kind, color }: { kind: HalfDayKind; color?: string }) {
  return (
    <Box
      aria-hidden
      w={14}
      h={14}
      style={{ borderRadius: 3, background: halfDayBackground(kind, color), flexShrink: 0 }}
    />
  );
}

/** Kinds legend, always visible (Q-N2); with day counts when statistics are given. */
export function Legend({ stats }: { stats?: Stats }) {
  const { t } = useTranslation("agenda");
  const days = new Map(stats?.by_kind.map((k) => [k.kind, k.days]));
  return (
    <Stack gap={4} aria-label={t("legend")}>
      {KINDS.map((kind) => (
        <Group key={kind} gap={8} wrap="nowrap">
          <Swatch kind={kind} />
          <Text size="sm" style={{ flex: 1 }}>
            {t(`kinds.${kind}`)}
          </Text>
          {stats && (
            <Text size="sm" c="dimmed">
              {t("daysCount", { count: days.get(kind) ?? 0 })}
            </Text>
          )}
        </Group>
      ))}
      {stats?.by_mission.map((m) => (
        <Group key={m.mission.id} gap={8} wrap="nowrap" pl="md">
          <Swatch kind="MISSION" color={m.color} />
          <Text size="xs" style={{ flex: 1 }} truncate>
            {m.mission.name}
          </Text>
          <Text size="xs" c="dimmed">
            {t("daysCount", { count: m.days })}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
