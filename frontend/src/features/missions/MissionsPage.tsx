import {
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { CompanySelect } from "../directory/components";
import { MISSION_STATUSES, type MissionStatus, type MissionSummary, useMissions } from "./api";
import { StatusBadge } from "./components";
import { CreateMissionModal } from "./CreateMissionModal";
import { formatDate, missionEnd } from "./format";

const PAGE_SIZE = 24;

function MissionCard({ mission }: { mission: MissionSummary }) {
  const { t, i18n } = useTranslation("missions");
  const end = missionEnd(mission);
  return (
    <Card
      withBorder
      component={Link}
      to={`/missions/${mission.id}`}
      aria-label={mission.title}
      style={{ borderLeft: `4px solid var(--mantine-color-${mission.color}-6)` }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Text fw={600}>{mission.title}</Text>
          <Text size="sm" c="dimmed">
            {mission.job_title} · {mission.client.name}
          </Text>
        </Box>
        <StatusBadge status={mission.status} />
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        {end
          ? t("period", {
              start: formatDate(mission.start_date, i18n.language),
              end: formatDate(end, i18n.language),
            })
          : t("since", { start: formatDate(mission.start_date, i18n.language) })}
      </Text>
      {mission.archived_at && (
        <Text size="xs" c="dimmed">
          {t("archived")}
        </Text>
      )}
    </Card>
  );
}

export function MissionsPage() {
  const { t } = useTranslation("missions");
  const [status, setStatus] = useState<"ALL" | MissionStatus>("ALL");
  const [clientId, setClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const missions = useMissions({
    q: debounced || undefined,
    status: status === "ALL" ? undefined : status,
    client_id: clientId ?? undefined,
    include_archived: archived,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.ceil((missions.data?.total ?? 0) / PAGE_SIZE);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("title")}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          {t("create")}
        </Button>
      </Group>
      <Group align="flex-end">
        <SegmentedControl
          aria-label={t("fields.status")}
          value={status}
          onChange={(v) => {
            setStatus(v as "ALL" | MissionStatus);
            setPage(1);
          }}
          data={[
            { value: "ALL", label: t("status.ALL") },
            ...MISSION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
          ]}
        />
        <CompanySelect
          aria-label={t("fields.client")}
          placeholder={t("allClients")}
          value={clientId}
          onChange={(v) => {
            setClientId(v);
            setPage(1);
          }}
        />
        <TextInput
          aria-label={t("search")}
          placeholder={t("search")}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Switch
          label={t("showArchived")}
          checked={archived}
          onChange={(e) => setArchived(e.currentTarget.checked)}
        />
      </Group>
      {missions.isPending ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : missions.data?.items.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {missions.data.items.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </SimpleGrid>
      ) : (
        <Text c="dimmed" ta="center" py="xl">
          {t("empty")}
        </Text>
      )}
      {pages > 1 && (
        <Group justify="center">
          <Pagination total={pages} value={page} onChange={setPage} size="sm" />
        </Group>
      )}
      <CreateMissionModal opened={creating} onClose={() => setCreating(false)} />
    </Stack>
  );
}
