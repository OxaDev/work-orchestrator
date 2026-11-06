import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconSunrise } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useUnfilled } from "../agenda/api";
import { todayIso } from "../agenda/calendar";
import { dayPath } from "../agenda/micro";
import { useDocuments } from "../documents/api";
import { useMissions } from "../missions/api";
import { formatDate } from "../missions/format";
import { useHealth } from "./useHealth";

function HealthCard() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const health = useHealth();

  return (
    <Card withBorder maw={480}>
      <Title order={5} mb="sm">
        {t("health.title")}
      </Title>
      {health.isPending && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm">{t("health.checking")}</Text>
        </Group>
      )}
      {health.isError && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} role="alert">
          {errorMessage(health.error)}
        </Alert>
      )}
      {health.isSuccess && (
        <Group gap="xs">
          <Badge color="teal">{t("health.ok")}</Badge>
          <Text size="xs" c="dimmed">
            {t("health.version", { version: health.data.version })}
          </Text>
        </Group>
      )}
    </Card>
  );
}

/** Morning entry point (P5-12): the standup screen. */
function StandupCard() {
  const { t } = useTranslation("agenda");
  return (
    <Card withBorder maw={480}>
      <Group justify="space-between">
        <div>
          <Title order={5}>{t("standup.homeTitle")}</Title>
          <Text size="sm" c="dimmed">
            {t("standup.homeText")}
          </Text>
        </div>
        <Button component={Link} to="/agenda/standup" leftSection={<IconSunrise size={16} />}>
          {t("standup.homeAction")}
        </Button>
      </Group>
    </Card>
  );
}

/** Missions running today, with their dashboard and today's agenda (P10-4, Q-K2). */
function ActiveMissionsCard() {
  const { t, i18n } = useTranslation("dashboard");
  const today = todayIso();
  const missions = useMissions({ active_on: today, limit: 5 });
  const items = missions.data?.items ?? [];
  if (!items.length) return null;
  return (
    <Card withBorder maw={480}>
      <Title order={5} mb="xs">
        {t("home.activeMissions")}
      </Title>
      <Stack gap={6}>
        {items.map((m) => (
          <Group key={m.id} justify="space-between" wrap="nowrap">
            <div>
              <Anchor component={Link} to={`/missions/${m.id}`} fw={600} size="sm">
                {m.title}
              </Anchor>
              <Text size="xs" c="dimmed">
                {m.client.name}
                {(m.actual_end_date ?? m.planned_end_date) &&
                  ` · ${t("home.until", { date: formatDate((m.actual_end_date ?? m.planned_end_date)!, i18n.language) })}`}
              </Text>
            </div>
            <Anchor component={Link} to={dayPath(today)} size="xs">
              {t("home.today")}
            </Anchor>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

/** Latest edited documents (P10-4). */
function RecentDocumentsCard() {
  const { t } = useTranslation("dashboard");
  const documents = useDocuments();
  const recent = [...(documents.data ?? [])]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);
  if (!recent.length) return null;
  return (
    <Card withBorder maw={480}>
      <Title order={5} mb="xs">
        {t("home.recentDocuments")}
      </Title>
      <Stack gap={4}>
        {recent.map((d) => (
          <Anchor key={d.id} component={Link} to={`/documents/${d.id}`} size="sm">
            {d.title}
          </Anchor>
        ))}
      </Stack>
    </Card>
  );
}

/** Past weekday half-days left empty (P4-11). */
function UnfilledCard() {
  const { t } = useTranslation("agenda");
  const unfilled = useUnfilled();
  if (!unfilled.data || unfilled.data.count === 0) return null;
  const first = unfilled.data.slots[0];
  const target = first
    ? `/agenda/${first.date.slice(0, 4)}/${Number(first.date.slice(5, 7))}`
    : "/agenda";
  return (
    <Alert color="orange" title={t("unfilled.title", { count: unfilled.data.count })} maw={480}>
      <Anchor component={Link} to={target} size="sm">
        {t("unfilled.action")}
      </Anchor>
    </Alert>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  return (
    <Stack>
      <div>
        <Title order={2}>{t("app.name")}</Title>
        <Text c="dimmed">{t("app.tagline")}</Text>
      </div>
      <StandupCard />
      <ActiveMissionsCard />
      <UnfilledCard />
      <RecentDocumentsCard />
      <HealthCard />
    </Stack>
  );
}
