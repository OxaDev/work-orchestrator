import {
  ActionIcon,
  Badge,
  Button,
  ColorSwatch,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { type TagWithUsage, useDeleteTag, useSaveTag, useTags } from "./api";
import { useNotify } from "./useNotify";

const TAG_COLORS = [
  "gray", "red", "pink", "grape", "violet", "indigo", "blue",
  "cyan", "teal", "green", "lime", "yellow", "orange",
] as const; // prettier-ignore
type TagColor = (typeof TAG_COLORS)[number];

function TagModal({ tag, onClose }: { tag?: TagWithUsage; onClose: () => void }) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const notify = useNotify();
  const save = useSaveTag();
  const form = useForm({
    initialValues: { name: tag?.name ?? "", color: (tag?.color ?? "gray") as TagColor },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });

  return (
    <Modal opened onClose={onClose} title={tag ? t("tags.edit") : t("tags.create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(
            { id: tag?.id, name: values.name.trim(), color: values.color },
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
          <TextInput label={t("tags.name")} {...form.getInputProps("name")} />
          <SimpleGrid cols={7} spacing={6} role="radiogroup" aria-label={t("tags.color")}>
            {TAG_COLORS.map((color) => (
              <ColorSwatch
                key={color}
                component="button"
                type="button"
                role="radio"
                aria-checked={form.values.color === color}
                aria-label={color}
                color={`var(--mantine-color-${color}-6)`}
                onClick={() => form.setFieldValue("color", color)}
                style={{
                  outline:
                    form.values.color === color ? "2px solid var(--mantine-color-text)" : undefined,
                }}
              />
            ))}
          </SimpleGrid>
          <Group>
            <Badge color={form.values.color} variant="light">
              {form.values.name || t("tags.preview")}
            </Badge>
          </Group>
          <Button type="submit" loading={save.isPending}>
            {tc("common.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function TagsPage() {
  const { t } = useTranslation("directory");
  const notify = useNotify();
  const tags = useTags();
  const remove = useDeleteTag();
  const [editing, setEditing] = useState<{ tag?: TagWithUsage } | null>(null);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("tags.create")}
        </Button>
      </Group>
      <EntityTable
        loading={tags.isPending}
        rows={tags.data}
        emptyText={t("tags.empty")}
        columns={[
          {
            key: "name",
            header: t("tags.name"),
            render: (tag) => (
              <Badge color={tag.color} variant="light">
                {tag.name}
              </Badge>
            ),
          },
          { key: "usage", header: t("tags.usage"), render: (tag) => tag.usage },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (tag) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("actions.editOf", { name: tag.name })}
                  onClick={() => setEditing({ tag })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("actions.deleteOf", { name: tag.name })}
                  onClick={() => setDeleting(tag)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && <TagModal tag={editing.tag} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("actions.deleteTitle")}
        message={t("tags.deleteMessage", {
          name: deleting?.name ?? "",
          count: deleting?.usage ?? 0,
        })}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: notify.error })
        }
      />
    </Stack>
  );
}
