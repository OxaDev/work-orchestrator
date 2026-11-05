import { Avatar, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconLogout, IconSettings } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useCurrentUser, useLogout } from "./useAuth";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu() {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <Menu position="bottom-end" width={220}>
      <Menu.Target>
        <UnstyledButton aria-label={t("userMenu.open")}>
          <Group gap={8} wrap="nowrap">
            <Avatar size="sm" radius="xl" color="indigo">
              {initials(user.display_name)}
            </Avatar>
            <Text size="sm" visibleFrom="sm">
              {user.display_name}
            </Text>
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{user.email}</Menu.Label>
        <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={16} />}>
          {t("nav.settings")}
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={16} />}
          onClick={() =>
            logout.mutate(undefined, {
              onSettled: () => void navigate("/login", { replace: true }),
            })
          }
        >
          {t("userMenu.logout")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
