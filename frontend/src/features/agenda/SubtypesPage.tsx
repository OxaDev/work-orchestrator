import { ActionIcon, Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { useNotify } from "../directory/useNotify";
import {
  type HalfDayKind,
  type Subtype,
  useDeleteSubtype,
  useSaveSubtype,
  useSubtypes,
} from "./api";
import { KINDS } from "./kinds";
import { Swatch } from "./Legend";

function SubtypeModal({ subtype, onClose }: { subtype?: Subtype; onClose: () => void }) {
  const { t } = useTranslation("agenda");
  const notify = useNotify();
  const save = useSaveSubtype();
  const form = useForm({
    initialValues: {
      kind: (subtype?.kind ?? "LEAVE") as HalfDayKind,
      name_fr: subtype?.name_fr ?? "",
      name_en: subtype?.name_en ?? "",
    },
    validate: {
      name_fr: (v) => (v.trim() ? null : t("validation.required")),
      name_en: (v) => (v.trim() ? null : t("validation.required")),
    },
  });
  return (
    <Modal opened onClose={onClose} title={subtype ? t("subtypes.edit") : t("subtypes.create")}>
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          save.mutate(
            { id: subtype?.id, kind: v.kind, name_fr: v.name_fr.trim(), name_en: v.name_en.trim() },
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
          <Select
            label={t("subtypes.kind")}
            disabled={Boolean(subtype)}
            allowDeselect={false}
            data={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
            {...form.getInputProps("kind")}
          />
          <TextInput label={t("subtypes.nameFr")} {...form.getInputProps("name_fr")} />
          <TextInput label={t("subtypes.nameEn")} {...form.getInputProps("name_en")} />
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** Editable subtypes of half-day kinds: CP, RTT, sick child... (Q-E1). */
export function SubtypesPage() {
  const { t, i18n } = useTranslation("agenda");
  const notify = useNotify();
  const subtypes = useSubtypes();
  const remove = useDeleteSubtype();
  const [editing, setEditing] = useState<{ subtype?: Subtype } | null>(null);
  const [deleting, setDeleting] = useState<Subtype | null>(null);
  const name = (s: Subtype) => (i18n.language === "en" ? s.name_en : s.name_fr);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("subtypes.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("subtypes.create")}
        </Button>
      </Group>
      <EntityTable
        loading={subtypes.isPending}
        rows={subtypes.data}
        emptyText={t("subtypes.empty")}
        columns={[
          {
            key: "kind",
            header: t("subtypes.kind"),
            render: (s) => (
              <Group gap={6} wrap="nowrap">
                <Swatch kind={s.kind} />
                {t(`kinds.${s.kind}`)}
              </Group>
            ),
          },
          { key: "fr", header: t("subtypes.nameFr"), render: (s) => s.name_fr },
          { key: "en", header: t("subtypes.nameEn"), render: (s) => s.name_en },
          { key: "usage", header: t("subtypes.usage"), render: (s) => s.usage },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (s) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("subtypes.editOf", { name: name(s) })}
                  onClick={() => setEditing({ subtype: s })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("subtypes.deleteOf", { name: name(s) })}
                  onClick={() => setDeleting(s)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && <SubtypeModal subtype={editing.subtype} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("subtypes.deleteTitle")}
        message={t("subtypes.deleteMessage", { name: deleting ? name(deleting) : "" })}
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
