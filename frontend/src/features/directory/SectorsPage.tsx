import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { buildTree, flattenTree, subtreeIds } from "../../components/tree";
import { TreeList } from "../../components/TreeList";
import { type Sector, useDeleteSector, useSaveSector, useSectors } from "./api";
import { useNotify } from "./useNotify";

type Editing = { sector?: Sector; parentId: string | null };

function SectorModal({
  editing,
  sectors,
  onClose,
}: {
  editing: Editing;
  sectors: Sector[];
  onClose: () => void;
}) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const notify = useNotify();
  const save = useSaveSector();
  const form = useForm({
    initialValues: {
      name_fr: editing.sector?.name_fr ?? "",
      name_en: editing.sector?.name_en ?? "",
      parent_id: editing.sector ? editing.sector.parent_id : editing.parentId,
    },
    validate: {
      name_fr: (v) => (v.trim() ? null : t("validation.required")),
      name_en: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  const forbidden = editing.sector ? subtreeIds(sectors, editing.sector.id) : new Set<string>();
  const parents = flattenTree(buildTree(sectors, (a, b) => a.name_fr.localeCompare(b.name_fr)))
    .filter((node) => !forbidden.has(node.item.id))
    .map((node) => ({
      value: node.item.id,
      label: `${"— ".repeat(node.depth)}${node.item.name_fr}`,
    }));

  return (
    <Modal
      opened
      onClose={onClose}
      title={editing.sector ? t("sectors.edit") : t("sectors.create")}
    >
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(
            { id: editing.sector?.id, ...values },
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
          <TextInput label={t("sectors.nameFr")} {...form.getInputProps("name_fr")} />
          <TextInput label={t("sectors.nameEn")} {...form.getInputProps("name_en")} />
          <Select
            label={t("sectors.parent")}
            placeholder={t("sectors.root")}
            clearable
            searchable
            data={parents}
            {...form.getInputProps("parent_id")}
          />
          <Button type="submit" loading={save.isPending}>
            {tc("common.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function SectorsPage() {
  const { t, i18n } = useTranslation("directory");
  const notify = useNotify();
  const sectors = useSectors();
  const remove = useDeleteSector();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Sector | null>(null);
  const name = (s: Sector) => (i18n.language === "en" ? s.name_en : s.name_fr);
  const items = sectors.data ?? [];

  return (
    <Stack>
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {t("sectors.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ parentId: null })}>
          {t("sectors.create")}
        </Button>
      </Group>
      <TreeList
        aria-label={t("sections.sectors")}
        items={items}
        compare={(a, b) => name(a).localeCompare(name(b))}
        empty={<Text c="dimmed">{t("sectors.empty")}</Text>}
        label={(s) => (
          <Group gap="xs">
            <span>{name(s)}</span>
            {s.company_count > 0 && (
              <Badge size="xs" variant="light">
                {t("sectors.companyCount", { count: s.company_count })}
              </Badge>
            )}
          </Group>
        )}
        actions={(s) => (
          <>
            <Tooltip label={t("sectors.addChild")}>
              <ActionIcon
                variant="subtle"
                aria-label={t("sectors.addChildOf", { name: name(s) })}
                onClick={() => setEditing({ parentId: s.id })}
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              aria-label={t("actions.editOf", { name: name(s) })}
              onClick={() => setEditing({ sector: s, parentId: s.parent_id })}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("actions.deleteOf", { name: name(s) })}
              onClick={() => setDeleting(s)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </>
        )}
      />
      {editing && (
        <SectorModal editing={editing} sectors={items} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("actions.deleteTitle")}
        message={t("actions.deleteMessage", { name: deleting ? name(deleting) : "" })}
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
