import { Button, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import type { LinkType } from "../../components/markdown";
import { buildTree, byTitle, flattenTree } from "../../components/tree";
import { useNotify } from "../directory/useNotify";
import { useCreateDocument, useDocuments, useDocumentTemplates } from "./api";

/** Creates a document, optionally under a page, from a template, attached to an entity, in a
 * project (top-level pages only: sub-pages take their parent's, ADR-0042). */
export function NewDocumentModal({
  attachTo,
  parentId = null,
  projectId = null,
  onClose,
}: {
  attachTo?: { type: LinkType; id: string };
  parentId?: string | null;
  projectId?: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("documents");
  const notify = useNotify();
  const navigate = useNavigate();
  const create = useCreateDocument();
  const documents = useDocuments(projectId ? { project_id: projectId } : {});
  const templates = useDocumentTemplates();
  const form = useForm({
    initialValues: {
      title: "",
      parent_id: parentId,
      template_id: null as string | null,
    },
    validate: { title: (v) => (v.trim() ? null : t("validation.required")) },
  });
  const parents = flattenTree(buildTree(documents.data ?? [], byTitle)).map((node) => ({
    value: node.item.id,
    label: `${"  ".repeat(node.depth)}${node.item.title}`,
  }));
  return (
    <Modal opened onClose={onClose} title={t("create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            {
              title: v.title.trim(),
              parent_id: v.parent_id,
              project_id: projectId,
              template_id: v.template_id,
              content_md: "",
              attach_to: attachTo ?? null,
            },
            {
              onSuccess: (created) => void navigate(`/documents/${created.id}`),
              onError: notify.error,
            },
          ),
        )}
      >
        <Stack>
          <TextInput label={t("fields.title")} data-autofocus {...form.getInputProps("title")} />
          <Select
            label={t("fields.parent")}
            placeholder={t("fields.root")}
            clearable
            data={parents}
            {...form.getInputProps("parent_id")}
          />
          <Select
            label={t("fields.template")}
            placeholder={t("fields.blank")}
            clearable
            data={(templates.data ?? []).map((tpl) => ({
              value: tpl.id,
              label: i18n.language === "en" ? tpl.name_en : tpl.name_fr,
            }))}
            {...form.getInputProps("template_id")}
          />
          <Button type="submit" loading={create.isPending}>
            {t("createAction")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
