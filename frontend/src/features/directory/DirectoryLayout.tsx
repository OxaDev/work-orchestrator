import { Stack, Tabs, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";

const SECTIONS = [
  "contacts",
  "companies",
  "technologies",
  "sectors",
  "tags",
  "roles",
  "day-types",
] as const;

export function DirectoryLayout() {
  const { t } = useTranslation("directory");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = SECTIONS.find((s) => pathname.startsWith(`/directory/${s}`)) ?? "contacts";

  return (
    <Stack>
      <Title order={2}>{t("title")}</Title>
      <Tabs value={current} onChange={(value) => value && void navigate(`/directory/${value}`)}>
        <Tabs.List>
          {SECTIONS.map((section) => (
            <Tabs.Tab key={section} value={section}>
              {t(`sections.${section}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Stack>
  );
}
