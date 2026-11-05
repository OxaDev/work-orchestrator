import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { buildTree, flattenTree, subtreeIds } from "../../components/tree";
import { TreeList } from "../../components/TreeList";
import { type OrgUnit, useDeleteOrgUnit, useOrgUnits, useSaveOrgUnit } from "./api";
import { useNotify } from "./useNotify";

const LEVEL_SUGGESTIONS = [
  "Direction",
  "Pôle",
  "Département",
  "Service",
  "Équipe",
  "Tribu",
  "Squad",
];

type Editing = { unit?: OrgUnit; parentId: string | null };

function OrgUnitModal({
  companyId,
  units,
  editing,
  onClose,
}: {
  companyId: string;
  units: OrgUnit[];
  editing: Editing;
  onClose: () => void;
}) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const notify = useNotify();
  const save = useSaveOrgUnit(companyId);
  const form = useForm({
    initialValues: {
      name: editing.unit?.name ?? "",
      level_label: editing.unit?.level_label ?? "",
      description: editing.unit?.description ?? "",
      parent_id: editing.unit ? editing.unit.parent_id : editing.parentId,
    },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });
  // A unit cannot move under itself or one of its descendants (RG-08).
  const forbidden = editing.unit ? subtreeIds(units, editing.unit.id) : new Set<string>();
  const parents = flattenTree(buildTree(units, (a, b) => a.name.localeCompare(b.name)))
    .filter((node) => !forbidden.has(node.item.id))
    .map((node) => ({ value: node.item.id, label: `${"— ".repeat(node.depth)}${node.item.name}` }));

  return (
    <Modal opened onClose={onClose} title={editing.unit ? t("org.edit") : t("org.create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(
            { id: editing.unit?.id, ...values, name: values.name.trim() },
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
          <TextInput label={t("org.name")} {...form.getInputProps("name")} />
          <Select
            label={t("org.level")}
            description={t("org.levelHelp")}
            data={LEVEL_SUGGESTIONS}
            searchable
            clearable
            {...form.getInputProps("level_label")}
            value={form.values.level_label || null}
            onChange={(v) => form.setFieldValue("level_label", v ?? "")}
          />
          <Select
            label={t("org.parent")}
            placeholder={t("org.root")}
            clearable
            searchable
            data={parents}
            {...form.getInputProps("parent_id")}
          />
          <Textarea
            label={t("common.description")}
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Button type="submit" loading={save.isPending}>
            {tc("common.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** Tree editor of a company's organisation (P2-7). Moving = choosing another parent. */
export function OrgChartEditor({ companyId }: { companyId: string }) {
  const { t } = useTranslation("directory");
  const notify = useNotify();
  const units = useOrgUnits(companyId);
  const remove = useDeleteOrgUnit(companyId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<OrgUnit | null>(null);
  const items = units.data ?? [];

  return (
    <Stack>
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {t("org.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ parentId: null })}>
          {t("org.create")}
        </Button>
      </Group>
      <TreeList
        aria-label={t("org.title")}
        items={items}
        compare={(a, b) => a.name.localeCompare(b.name)}
        empty={<Text c="dimmed">{t("org.empty")}</Text>}
        label={(unit) => (
          <>
            {unit.level_label && (
              <Text span c="dimmed" size="xs" mr={6}>
                {unit.level_label}
              </Text>
            )}
            {unit.name}
          </>
        )}
        actions={(unit) => (
          <>
            <ActionIcon
              variant="subtle"
              aria-label={t("org.addChildOf", { name: unit.name })}
              onClick={() => setEditing({ parentId: unit.id })}
            >
              <IconPlus size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={t("actions.editOf", { name: unit.name })}
              onClick={() => setEditing({ unit, parentId: unit.parent_id })}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("actions.deleteOf", { name: unit.name })}
              onClick={() => setDeleting(unit)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </>
        )}
      />
      {editing && (
        <OrgUnitModal
          companyId={companyId}
          units={items}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("actions.deleteTitle")}
        message={t("actions.deleteMessage", { name: deleting?.name ?? "" })}
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
