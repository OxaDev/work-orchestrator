import { Stack, Tabs, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";

import { useCurrentUser } from "../auth/useAuth";

const TABS = [
  { value: "/settings", labelKey: "settings.tabs.profile", adminOnly: false },
  { value: "/settings/password", labelKey: "settings.tabs.password", adminOnly: false },
  { value: "/settings/users", labelKey: "settings.tabs.users", adminOnly: true },
];

export function SettingsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const tabs = TABS.filter((tab) => !tab.adminOnly || user?.role === "ADMIN");

  return (
    <Stack>
      <Title order={2}>{t("nav.settings")}</Title>
      <Tabs value={pathname} onChange={(value) => value && void navigate(value)}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Stack>
  );
}
