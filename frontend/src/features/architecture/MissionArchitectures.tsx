import { ActionIcon, Anchor, Button, Grid, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useNotify } from "../directory/useNotify";
import type { MissionDetail } from "../missions/api";
import { useArchitectures, useExternalLinks, useMissionLink } from "./api";
import { ArchitectureModal } from "./ArchitectureModal";
import { ExternalLinks } from "./ExternalLinks";

/** Mission tab: the client's architectures this mission works on (Q-H1), external links. */
export function MissionArchitectures({ mission }: { mission: MissionDetail }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const linked = useArchitectures({ mission_id: mission.id });
  const clientArchitectures = useArchitectures({ company_id: mission.client.id });
  const links = useExternalLinks("MISSION", mission.id);
  const link = useMissionLink();
  const [creating, setCreating] = useState(false);
  const ids = new Set((linked.data ?? []).map((a) => a.id));
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{t("mission.title")}</Title>
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
              {t("mission.empty")}
            </Text>
          )}
          {(linked.data ?? []).map((a) => (
            <Group key={a.id} justify="space-between">
              <Anchor component={Link} to={`/architecture/architectures/${a.id}`} size="sm">
                {a.name}
              </Anchor>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t("mission.unlinkOf", { name: a.name })}
                onClick={() =>
                  link.mutate(
                    { architectureId: a.id, missionId: mission.id, linked: false },
                    { onError: notify.error },
                  )
                }
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Select
            label={t("mission.link")}
            placeholder={t("mission.linkPlaceholder", { client: mission.client.name })}
            value={null}
            data={(clientArchitectures.data ?? [])
              .filter((a) => !ids.has(a.id))
              .map((a) => ({ value: a.id, label: a.name }))}
            onChange={(value) =>
              value &&
              link.mutate(
                { architectureId: value, missionId: mission.id, linked: true },
                { onError: notify.error },
              )
            }
          />
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="xs">
          <Title order={5}>{t("links.title")}</Title>
          <ExternalLinks entityType="MISSION" entityId={mission.id} links={links.data ?? []} />
        </Stack>
      </Grid.Col>
      {creating && (
        <ArchitectureModal
          companyId={mission.client.id}
          missionId={mission.id}
          onClose={() => setCreating(false)}
        />
      )}
    </Grid>
  );
}
