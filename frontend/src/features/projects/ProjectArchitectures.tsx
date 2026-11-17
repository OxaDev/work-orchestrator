import { ActionIcon, Anchor, Button, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useArchitectures, useProjectLink } from "../architecture/api";
import { ArchitectureModal } from "../architecture/ArchitectureModal";
import { useNotify } from "../directory/useNotify";
import type { ProjectSummary } from "./api";

/** Project tab: the client's architectures this project works on (Q-H1, ADR-0042). */
export function ProjectArchitectures({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const linked = useArchitectures({ project_id: project.id });
  const clientArchitectures = useArchitectures({ company_id: project.client.id });
  const link = useProjectLink();
  const [creating, setCreating] = useState(false);
  const ids = new Set((linked.data ?? []).map((a) => a.id));
  return (
    <Stack gap="xs" maw={640}>
      <Group justify="space-between">
        <Title order={5}>{t("project.title")}</Title>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          {t("architectures.create")}
        </Button>
      </Group>
      {(linked.data ?? []).length === 0 && (
        <Text size="sm" c="dimmed">
          {t("project.empty")}
        </Text>
      )}
      {(linked.data ?? []).map((a) => (
        <Group key={a.id} justify="space-between">
          <Group gap="xs">
            <Anchor component={Link} to={`/architecture/architectures/${a.id}`} size="sm">
              {a.name}
            </Anchor>
            <Anchor component={Link} to={`/architecture/architectures/${a.id}/graph`} size="xs">
              {t("graph.open")}
            </Anchor>
          </Group>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t("project.unlinkOf", { name: a.name })}
            onClick={() =>
              link.mutate(
                { architectureId: a.id, projectId: project.id, linked: false },
                { onError: notify.error },
              )
            }
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Select
        label={t("project.link")}
        placeholder={t("project.linkPlaceholder", { client: project.client.name })}
        value={null}
        data={(clientArchitectures.data ?? [])
          .filter((a) => !ids.has(a.id))
          .map((a) => ({ value: a.id, label: a.name }))}
        onChange={(value) =>
          value &&
          link.mutate(
            { architectureId: value, projectId: project.id, linked: true },
            { onError: notify.error },
          )
        }
      />
      {creating && (
        <ArchitectureModal
          companyId={project.client.id}
          projectId={project.id}
          onClose={() => setCreating(false)}
        />
      )}
    </Stack>
  );
}
