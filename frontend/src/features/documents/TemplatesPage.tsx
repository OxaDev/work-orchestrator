import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { useNotify } from "../directory/useNotify";
import {
  type DocumentTemplate,
  useDeleteDocumentTemplate,
  useDocumentTemplates,
  useSaveDocumentTemplate,
} from "./api";

function TemplateModal({
  template,
  onClose,
}: {
  template?: DocumentTemplate;
  onClose: () => void;
}) {
  const { t } = useTranslation("documents");
  const notify = useNotify();
  const save = useSaveDocumentTemplate();
  const form = useForm({
    initialValues: {
      name_fr: template?.name_fr ?? "",
      name_en: template?.name_en ?? "",
      content_md: template?.content_md ?? "",
    },
    validate: {
      name_fr: (v) => (v.trim() ? null : t("validation.required")),
      name_en: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title={template ? t("templates.edit") : t("templates.create")}
      size="xl"
    >
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          save.mutate(
            {
              id: template?.id,
              name_fr: v.name_fr.trim(),
              name_en: v.name_en.trim(),
              content_md: v.content_md,
            },
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
          <Group grow>
            <TextInput label={t("templates.nameFr")} {...form.getInputProps("name_fr")} />
            <TextInput label={t("templates.nameEn")} {...form.getInputProps("name_en")} />
          </Group>
          <Textarea
            label={t("templates.content")}
            autosize
            minRows={10}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            {...form.getInputProps("content_md")}
          />
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** /documents/templates — editable document templates (P7-6). */
export function DocumentTemplatesPage() {
  const { t, i18n } = useTranslation("documents");
  const notify = useNotify();
  const templates = useDocumentTemplates();
  const remove = useDeleteDocumentTemplate();
  const [editing, setEditing] = useState<{ template?: DocumentTemplate } | null>(null);
  const [deleting, setDeleting] = useState<DocumentTemplate | null>(null);
  const name = (tpl: DocumentTemplate) => (i18n.language === "en" ? tpl.name_en : tpl.name_fr);
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("templates.title")}</Title>
        <Anchor component={Link} to="/documents" size="sm">
          {t("title")}
        </Anchor>
      </Group>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("templates.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("templates.create")}
        </Button>
      </Group>
      <EntityTable
        loading={templates.isPending}
        rows={templates.data}
        emptyText={t("templates.empty")}
        columns={[
          { key: "fr", header: t("templates.nameFr"), render: (tpl) => tpl.name_fr },
          { key: "en", header: t("templates.nameEn"), render: (tpl) => tpl.name_en },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (tpl) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("templates.editOf", { name: name(tpl) })}
                  onClick={() => setEditing({ template: tpl })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("templates.deleteOf", { name: name(tpl) })}
                  onClick={() => setDeleting(tpl)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && <TemplateModal template={editing.template} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("deleteTitle")}
        message={t("templates.deleteMessage", { name: deleting ? name(deleting) : "" })}
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
