import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  SegmentedControl,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router";

import { UserMenu } from "../../features/auth/UserMenu";
import { useCurrentUser, useUpdateProfile } from "../../features/auth/useAuth";
import { isLocale, setLocale, SUPPORTED_LOCALES } from "../../i18n";
import { isActive, NAV_ITEMS } from "../navigation";

/** Language and theme changes are saved on the profile so they follow the user (ADR-0013). */
function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  return (
    <SegmentedControl
      size="xs"
      aria-label={t("header.language")}
      value={i18n.resolvedLanguage ?? "fr"}
      onChange={(value) => {
        if (!isLocale(value)) return;
        void setLocale(value);
        if (user && user.locale !== value) updateProfile.mutate({ locale: value });
      }}
      data={SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: locale.toUpperCase() }))}
    />
  );
}

function ColorSchemeToggle() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light");
  const updateProfile = useUpdateProfile();
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={t("header.colorScheme")}
      onClick={() => {
        const next = computed === "dark" ? "light" : "dark";
        setColorScheme(next);
        updateProfile.mutate({ theme: next });
      }}
    >
      {computed === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure();
  const { pathname } = useLocation();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={t("nav.toggleMenu")}
            />
            <Title order={4}>{t("app.name")}</Title>
          </Group>
          <Group gap="sm">
            <LanguageSwitch />
            <ColorSchemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" component="nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            component={Link}
            to={item.path}
            label={t(item.labelKey)}
            leftSection={<item.icon size={18} stroke={1.6} />}
            active={isActive(item.path, pathname)}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
