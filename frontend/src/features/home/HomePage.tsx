import { Alert, Anchor, Badge, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useUnfilled } from "../agenda/api";
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
      <UnfilledCard />
      <HealthCard />
    </Stack>
  );
}
