import { Alert, Button, Group, Stack, Title } from "@mantine/core";
import { IconHome, IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * Shown in place of a page that crashed while rendering (P12-5): the app shell stays, the
 * user is told in their language and offered a way out. Details go to the console only.
 */
export function RouteError() {
  const { t } = useTranslation();
  return (
    <Stack maw={640}>
      <Title order={2}>{t("routeError.title")}</Title>
      <Alert color="red">{t("routeError.body")}</Alert>
      <Group>
        <Button leftSection={<IconRefresh size={16} />} onClick={() => window.location.reload()}>
          {t("routeError.reload")}
        </Button>
        <Button component={Link} to="/" variant="default" leftSection={<IconHome size={16} />}>
          {t("routeError.home")}
        </Button>
      </Group>
    </Stack>
  );
}
