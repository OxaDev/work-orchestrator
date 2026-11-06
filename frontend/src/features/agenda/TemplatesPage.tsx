import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconCopy, IconPencil, IconPlayerPlay, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EntityTable } from "../../components/EntityTable";
import { useNotify } from "../directory/useNotify";
import { AgendaViews } from "./AgendaViews";
import { type ApplyDefaults, ApplyTemplateModal } from "./ApplyTemplateModal";
import { monthRange, todayIso } from "./calendar";
import {
  type WeekTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useWeekTemplates,
} from "./templatesApi";
import { useMissionIndex } from "./useLabels";

/** Asks a name, then creates (empty) or duplicates a template. */
function NameModal({
  title,
  initial,
  loading,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  loading: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("agenda");
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  return (
    <Modal opened onClose={onClose} title={title}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <Stack>
          <TextInput
            label={t("templates.name")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            error={touched && !name.trim() ? t("validation.required") : null}
            data-autofocus
          />
          <Button type="submit" loading={loading}>
            {t("save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** /agenda/templates — the user's week templates (P6-6). */
export function TemplatesPage() {
  const { t } = useTranslation("agenda");
  const notify = useNotify();
  const navigate = useNavigate();
  const templates = useWeekTemplates();
  const missions = useMissionIndex();
  const create = useCreateTemplate();
  const duplicate = useDuplicateTemplate();
  const remove = useDeleteTemplate();
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState<WeekTemplate | null>(null);
  const [deleting, setDeleting] = useState<WeekTemplate | null>(null);
  const [applying, setApplying] = useState<ApplyDefaults | null>(null);
  const today = todayIso();
  const month = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("templates.title")}</Title>
        <AgendaViews date={today} current="templates" />
      </Group>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("templates.help")}
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          {t("templates.create")}
        </Button>
      </Group>
      <EntityTable
        loading={templates.isPending}
        rows={templates.data}
        emptyText={t("templates.empty")}
        emptyAction={
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >
            {t("templates.create")}
          </Button>
        }
        columns={[
          {
            key: "name",
            header: t("templates.name"),
            render: (tpl) => (
              <Text component={Link} to={`/agenda/templates/${tpl.id}`} size="sm" c="blue">
                {tpl.name}
              </Text>
            ),
          },
          {
            key: "mission",
            header: t("templates.mission"),
            render: (tpl) => (tpl.mission_id ? (missions.get(tpl.mission_id)?.title ?? "") : "—"),
          },
          {
            key: "slots",
            header: t("templates.slots"),
            render: (tpl) => t("templates.slotCount", { count: tpl.slots.length }),
          },
          {
            key: "actions",
            header: "",
            width: 160,
            render: (tpl) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("templates.applyOf", { name: tpl.name })}
                  onClick={() =>
                    setApplying({ templateId: tpl.id, start: month.from, end: month.to })
                  }
                >
                  <IconPlayerPlay size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  component={Link}
                  to={`/agenda/templates/${tpl.id}`}
                  aria-label={t("templates.editOf", { name: tpl.name })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  aria-label={t("templates.duplicateOf", { name: tpl.name })}
                  onClick={() => setCopying(tpl)}
                >
                  <IconCopy size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("templates.deleteOf", { name: tpl.name })}
                  onClick={() => setDeleting(tpl)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {creating && (
        <NameModal
          title={t("templates.create")}
          initial=""
          loading={create.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(name) =>
            create.mutate(
              { name, description: "", mission_id: null, slots: [] },
              {
                onSuccess: (created) => void navigate(`/agenda/templates/${created.id}`),
                onError: notify.error,
              },
            )
          }
        />
      )}
      {copying && (
        <NameModal
          title={t("templates.duplicateOf", { name: copying.name })}
          initial={t("templates.copyName", { name: copying.name })}
          loading={duplicate.isPending}
          onClose={() => setCopying(null)}
          onSubmit={(name) =>
            duplicate.mutate(
              { id: copying.id, name },
              {
                onSuccess: () => {
                  notify.saved();
                  setCopying(null);
                },
                onError: notify.error,
              },
            )
          }
        />
      )}
      {applying && <ApplyTemplateModal defaults={applying} onClose={() => setApplying(null)} />}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("templates.deleteTitle")}
        message={t("templates.deleteMessage", { name: deleting?.name ?? "" })}
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
