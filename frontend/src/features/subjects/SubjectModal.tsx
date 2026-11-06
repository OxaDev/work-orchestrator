import { Button, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { buildTree, flattenTree, subtreeIds } from "../../components/tree";
import { useNotify } from "../directory/useNotify";
import {
  type Subject,
  type SubjectStatus,
  SUBJECT_STATUSES,
  useCategories,
  useUpdateSubject,
} from "./api";

const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Edits a subject; the parent select only offers same-scope subjects outside its subtree. */
export function SubjectModal({
  subject,
  siblings,
  onClose,
}: {
  subject: Subject;
  /** Subjects of the same scope (and mission): candidate parents. */
  siblings: readonly Subject[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("subjects");
  const notify = useNotify();
  const update = useUpdateSubject();
  const categories = useCategories();
  const form = useForm({
    initialValues: {
      title: subject.title,
      status: subject.status as SubjectStatus,
      category_id: subject.category_id,
      external_url: subject.external_url ?? "",
      parent_id: subject.parent_id,
      description: subject.description,
    },
    validate: {
      title: (v) => (v.trim() ? null : t("validation.required")),
      external_url: (v) => (!v.trim() || isUrl(v.trim()) ? null : t("validation.url")),
    },
  });
  const excluded = subtreeIds(siblings, subject.id);
  const parents = flattenTree(buildTree(siblings, (a, b) => a.title.localeCompare(b.title))).filter(
    (node) => !excluded.has(node.item.id),
  );

  return (
    <Modal opened onClose={onClose} title={t("form.editTitle")}>
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          update.mutate(
            {
              id: subject.id,
              title: v.title.trim(),
              status: v.status,
              category_id: v.category_id,
              external_url: v.external_url.trim() || null,
              parent_id: v.parent_id,
              description: v.description,
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
          <TextInput label={t("form.title")} {...form.getInputProps("title")} />
          <Select
            label={t("form.status")}
            allowDeselect={false}
            data={SUBJECT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            {...form.getInputProps("status")}
          />
          <Select
            label={t("form.category")}
            clearable
            data={(categories.data ?? []).map((c) => ({
              value: c.id,
              label: i18n.language === "en" ? c.name_en : c.name_fr,
            }))}
            {...form.getInputProps("category_id")}
          />
          <Select
            label={t("form.parent")}
            clearable
            placeholder={t("form.root")}
            data={parents.map((node) => ({
              value: node.item.id,
              label: `${"  ".repeat(node.depth)}${node.item.title}`,
            }))}
            {...form.getInputProps("parent_id")}
          />
          <TextInput label={t("form.externalUrl")} {...form.getInputProps("external_url")} />
          <Textarea
            label={t("form.description")}
            autosize
            minRows={3}
            {...form.getInputProps("description")}
          />
          <Button type="submit" loading={update.isPending}>
            {t("form.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
