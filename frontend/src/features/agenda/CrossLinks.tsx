import { Anchor, Group, Text } from "@mantine/core";
import { IconTopologyStar3 } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useArchitectures } from "../architecture/api";
import type { Task } from "./tasksApi";

/** The architectures of a mission, one click from an agenda day (P10-6, ADR-0039). */
export function MissionArchitectureLinks({ missionId }: { missionId: string }) {
  const { t } = useTranslation("agenda");
  const architectures = useArchitectures({ mission_id: missionId });
  if (!architectures.data?.length) return null;
  return (
    <Group gap={6} wrap="wrap">
      <IconTopologyStar3 size={14} aria-hidden />
      {architectures.data.map((a) => (
        <Anchor
          key={a.id}
          component={Link}
          to={`/architecture/architectures/${a.id}`}
          size="sm"
          aria-label={t("day.architecture", { name: a.name })}
        >
          {a.name}
        </Anchor>
      ))}
    </Group>
  );
}

/** The domains a task's subject is linked to (P10-6). */
export function TaskDomainLinks({ task }: { task: Task }) {
  const { t } = useTranslation("agenda");
  if (!task.domains.length) return null;
  return (
    <Group gap={4} wrap="wrap">
      <Text size="xs" c="dimmed">
        {t("day.domains")}
      </Text>
      {task.domains.map((domain) => (
        <Anchor
          key={domain.id}
          component={Link}
          to={`/architecture/domains/${domain.id}`}
          size="xs"
        >
          {domain.name}
        </Anchor>
      ))}
    </Group>
  );
}
