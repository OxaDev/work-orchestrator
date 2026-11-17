import { Anchor, Button, Grid, Group, Stack, Switch, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { useExternalLinks } from "../architecture/api";
import { ExternalLinks } from "../architecture/ExternalLinks";
import type { MissionDetail } from "../missions/api";
import { projectPath, useProjects } from "./api";
import { ProjectModal } from "./ProjectModal";

/** Mission tab: its projects (ADR-0042) and the mission's external links. */
export function MissionProjects({ mission }: { mission: MissionDetail }) {
  const { t } = useTranslation("projects");
  const [archived, setArchived] = useState(false);
  const projects = useProjects({ mission_id: mission.id, include_archived: archived });
  const links = useExternalLinks("MISSION", mission.id);
  const [creating, setCreating] = useState(false);
  const create = (
    <Button
      size="xs"
      variant="light"
      leftSection={<IconPlus size={14} />}
      onClick={() => setCreating(true)}
    >
      {t("create")}
    </Button>
  );
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 8 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{t("title")}</Title>
            <Group gap="xs">
              <Switch
                size="xs"
                label={t("showArchived")}
                checked={archived}
                onChange={(e) => setArchived(e.currentTarget.checked)}
              />
              {create}
            </Group>
          </Group>
          <Text size="sm" c="dimmed">
            {t("help")}
          </Text>
          <EntityTable
            loading={projects.isPending}
            rows={projects.data?.items}
            emptyText={t("empty")}
            emptyAction={create}
            columns={[
              {
                key: "name",
                header: t("fields.name"),
                render: (p) => (
                  <Anchor
                    component={Link}
                    to={projectPath(p)}
                    size="sm"
                    td={p.archived_at ? "line-through" : undefined}
                  >
                    {p.name}
                  </Anchor>
                ),
              },
              { key: "documents", header: t("fields.documents"), render: (p) => p.document_count },
              {
                key: "architectures",
                header: t("fields.architectures"),
                render: (p) => p.architecture_count,
              },
            ]}
          />
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="xs">
          <Title order={5}>{t("architecture:links.title")}</Title>
          <ExternalLinks entityType="MISSION" entityId={mission.id} links={links.data ?? []} />
        </Stack>
      </Grid.Col>
      {creating && <ProjectModal missionId={mission.id} onClose={() => setCreating(false)} />}
    </Grid>
  );
}
