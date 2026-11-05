import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconKey, IconPencil, IconUserPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { UserRead } from "../../api/client";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { PasswordChecklist } from "../auth/PasswordChecklist";
import { passwordViolations } from "../auth/passwordPolicy";
import { useCreateUser, useResetPassword, useUpdateUser, useUsers } from "./useUsers";

type Role = UserRead["role"];

function useRoleOptions() {
  const { t } = useTranslation();
  return (["USER", "ADMIN"] as const).map((value) => ({ value, label: t(`roles.${value}`) }));
}

function CreateUserModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateUser();
  const roles = useRoleOptions();
  const form = useForm({
    initialValues: { email: "", display_name: "", password: "", role: "USER" as Role },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : t("auth.emailInvalid")),
      display_name: (v) => (v.trim() ? null : t("settings.profile.nameRequired")),
      password: (v) => (passwordViolations(v).length ? t("password.notCompliant") : null),
    },
  });
  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title={t("users.create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          create.mutate(values, {
            onSuccess: () => {
              notifications.show({ color: "teal", message: t("users.created") });
              close();
            },
          }),
        )}
      >
        <Stack>
          {create.isError && (
            <Alert color="red" role="alert">
              {errorMessage(create.error)}
            </Alert>
          )}
          <TextInput label={t("auth.email")} type="email" {...form.getInputProps("email")} />
          <TextInput
            label={t("settings.profile.displayName")}
            {...form.getInputProps("display_name")}
          />
          <Select
            label={t("users.role")}
            data={roles}
            allowDeselect={false}
            {...form.getInputProps("role")}
          />
          <PasswordInput
            label={t("users.initialPassword")}
            autoComplete="new-password"
            {...form.getInputProps("password")}
          />
          <PasswordChecklist password={form.values.password} />
          <Button type="submit" loading={create.isPending}>
            {t("users.create")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserRead; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateUser();
  const roles = useRoleOptions();
  const form = useForm({
    initialValues: { display_name: user.display_name, role: user.role, is_active: user.is_active },
  });

  return (
    <Modal opened onClose={onClose} title={user.email}>
      <form
        noValidate
        onSubmit={form.onSubmit((changes) =>
          update.mutate(
            { id: user.id, changes },
            {
              onSuccess: () => {
                notifications.show({ color: "teal", message: t("common.saved") });
                onClose();
              },
            },
          ),
        )}
      >
        <Stack>
          {update.isError && (
            <Alert color="red" role="alert">
              {errorMessage(update.error)}
            </Alert>
          )}
          <TextInput
            label={t("settings.profile.displayName")}
            {...form.getInputProps("display_name")}
          />
          <Select
            label={t("users.role")}
            data={roles}
            allowDeselect={false}
            {...form.getInputProps("role")}
          />
          <Switch
            label={t("users.active")}
            {...form.getInputProps("is_active", { type: "checkbox" })}
          />
          <Button type="submit" loading={update.isPending}>
            {t("common.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRead; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const reset = useResetPassword();
  const form = useForm({
    initialValues: { password: "" },
    validate: {
      password: (v) => (passwordViolations(v).length ? t("password.notCompliant") : null),
    },
  });

  return (
    <Modal opened onClose={onClose} title={t("users.resetPasswordOf", { email: user.email })}>
      <form
        noValidate
        onSubmit={form.onSubmit(({ password }) =>
          reset.mutate(
            { id: user.id, password },
            {
              onSuccess: () => {
                notifications.show({ color: "teal", message: t("users.passwordReset") });
                onClose();
              },
            },
          ),
        )}
      >
        <Stack>
          {reset.isError && (
            <Alert color="red" role="alert">
              {errorMessage(reset.error)}
            </Alert>
          )}
          <PasswordInput
            label={t("password.new")}
            autoComplete="new-password"
            {...form.getInputProps("password")}
          />
          <PasswordChecklist password={form.values.password} />
          <Button type="submit" loading={reset.isPending}>
            {t("users.resetPassword")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function UsersAdmin() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const users = useUsers();
  const [createOpened, createModal] = useDisclosure(false);
  const [editing, setEditing] = useState<UserRead | null>(null);
  const [resetting, setResetting] = useState<UserRead | null>(null);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (users.isPending) return <Loader size="sm" />;
  if (users.isError) return <Alert color="red">{errorMessage(users.error)}</Alert>;

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconUserPlus size={16} />} onClick={createModal.open}>
          {t("users.create")}
        </Button>
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("auth.email")}</Table.Th>
              <Table.Th>{t("settings.profile.displayName")}</Table.Th>
              <Table.Th>{t("users.role")}</Table.Th>
              <Table.Th>{t("users.status")}</Table.Th>
              <Table.Th>{t("users.lastLogin")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.data.items.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>{user.email}</Table.Td>
                <Table.Td>{user.display_name}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={user.role === "ADMIN" ? "grape" : "gray"}>
                    {t(`roles.${user.role}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge variant="dot" color={user.is_active ? "teal" : "red"}>
                    {t(user.is_active ? "users.active" : "users.inactive")}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {user.last_login_at ? dateFormat.format(new Date(user.last_login_at)) : "—"}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label={t("users.edit")}>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t("users.editOf", { email: user.email })}
                        onClick={() => setEditing(user)}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("users.resetPassword")}>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t("users.resetPasswordOf", { email: user.email })}
                        onClick={() => setResetting(user)}
                      >
                        <IconKey size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <CreateUserModal opened={createOpened} onClose={createModal.close} />
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </Stack>
  );
}
