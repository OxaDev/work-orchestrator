import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { useNotify } from "../directory/useNotify";
import { type Category, useCategories, useDeleteCategory, useSaveCategory } from "./api";

function CategoryModal({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { t } = useTranslation("subjects");
  const notify = useNotify();
  const save = useSaveCategory();
  const form = useForm({
    initialValues: { name_fr: category?.name_fr ?? "", name_en: category?.name_en ?? "" },
    validate: {
      name_fr: (v) => (v.trim() ? null : t("validation.required")),
      name_en: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title={category ? t("categories.edit") : t("categories.create")}
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          save.mutate(
            { id: category?.id, name_fr: v.name_fr.trim(), name_en: v.name_en.trim() },
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
          <TextInput label={t("categories.nameFr")} {...form.getInputProps("name_fr")} />
          <TextInput label={t("categories.nameEn")} {...form.getInputProps("name_en")} />
          <Button type="submit" loading={save.isPending}>
            {t("form.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** Editable subject categories: technology watch, pre-sales... (Q-G6). */
export function CategoriesPage() {
  const { t, i18n } = useTranslation("subjects");
  const notify = useNotify();
  const categories = useCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<{ category?: Category } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const name = (c: Category) => (i18n.language === "en" ? c.name_en : c.name_fr);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("categories.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("categories.create")}
        </Button>
      </Group>
      <EntityTable
        loading={categories.isPending}
        rows={categories.data}
        emptyText={t("categories.empty")}
        columns={[
          { key: "fr", header: t("categories.nameFr"), render: (c) => c.name_fr },
          { key: "en", header: t("categories.nameEn"), render: (c) => c.name_en },
          { key: "usage", header: t("categories.usage"), render: (c) => c.usage },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (c) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("categories.editOf", { name: name(c) })}
                  onClick={() => setEditing({ category: c })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("categories.deleteOf", { name: name(c) })}
                  onClick={() => setDeleting(c)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && <CategoryModal category={editing.category} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("categories.deleteTitle")}
        message={t("categories.deleteMessage", { name: deleting ? name(deleting) : "" })}
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
