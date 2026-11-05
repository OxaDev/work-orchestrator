import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { useNotify } from "../directory/useNotify";
import { type RoleWithUsage, useContactRoles, useDeleteRole, useSaveRole } from "./api";

function RoleModal({ role, onClose }: { role?: RoleWithUsage; onClose: () => void }) {
  const { t } = useTranslation("missions");
  const notify = useNotify();
  const save = useSaveRole();
  const form = useForm({
    initialValues: { name_fr: role?.name_fr ?? "", name_en: role?.name_en ?? "" },
    validate: {
      name_fr: (v) => (v.trim() ? null : t("validation.required")),
      name_en: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  return (
    <Modal opened onClose={onClose} title={role ? t("roles.edit") : t("roles.create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(
            { id: role?.id, name_fr: values.name_fr.trim(), name_en: values.name_en.trim() },
            {
              onSuccess: () => {
                notify.saved();
                onClose();
              },
              onError: notify.error,
            },
          ),
        )}
      >
        <Stack>
          <TextInput label={t("roles.nameFr")} {...form.getInputProps("name_fr")} />
          <TextInput label={t("roles.nameEn")} {...form.getInputProps("name_en")} />
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** Editable list of roles a contact can play in a mission (Q-D3). */
export function RolesPage() {
  const { t, i18n } = useTranslation("missions");
  const notify = useNotify();
  const roles = useContactRoles();
  const remove = useDeleteRole();
  const [editing, setEditing] = useState<{ role?: RoleWithUsage } | null>(null);
  const [deleting, setDeleting] = useState<RoleWithUsage | null>(null);
  const name = (r: RoleWithUsage) => (i18n.language === "en" ? r.name_en : r.name_fr);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("roles.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("roles.create")}
        </Button>
      </Group>
      <EntityTable
        loading={roles.isPending}
        rows={roles.data}
        emptyText={t("roles.empty")}
        columns={[
          { key: "fr", header: t("roles.nameFr"), render: (r) => r.name_fr },
          { key: "en", header: t("roles.nameEn"), render: (r) => r.name_en },
          { key: "usage", header: t("roles.usage"), render: (r) => r.usage },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (r) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("roles.editOf", { name: name(r) })}
                  onClick={() => setEditing({ role: r })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("roles.deleteOf", { name: name(r) })}
                  onClick={() => setDeleting(r)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && <RoleModal role={editing.role} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("deleteTitle")}
        message={t("roles.deleteMessage", { name: deleting ? name(deleting) : "" })}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => {
              setDeleting(null);
              notify.error(error);
            },
          })
        }
      />
    </Stack>
  );
}
