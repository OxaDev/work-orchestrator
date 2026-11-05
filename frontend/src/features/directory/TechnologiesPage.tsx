import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  TagsInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { IconArchive, IconArchiveOff, IconPencil, IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { EntityTable } from "../../components/EntityTable";
import {
  TECHNOLOGY_CATEGORIES,
  type Technology,
  type TechnologyCategory,
  useArchiveTechnology,
  useSaveTechnology,
  useTechnologies,
} from "./api";
import { TagBadges, TagInput } from "./components";
import { useNotify } from "./useNotify";

const PAGE_SIZE = 50;

function TechnologyModal({
  technology,
  onClose,
}: {
  technology?: Technology;
  onClose: () => void;
}) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const notify = useNotify();
  const save = useSaveTechnology();
  const form = useForm({
    initialValues: {
      name: technology?.name ?? "",
      category: (technology?.category ?? "OTHER") as TechnologyCategory,
      aliases: technology?.aliases ?? [],
      description: technology?.description ?? "",
      website: technology?.website ?? "",
      tag_ids: technology?.tags.map((tag) => tag.id) ?? [],
    },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={technology ? technology.name : t("technologies.create")}
      size="lg"
    >
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate(
            { id: technology?.id, ...values, website: values.website.trim() || null },
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
          <TextInput label={t("technologies.name")} {...form.getInputProps("name")} />
          <Select
            label={t("technologies.category")}
            allowDeselect={false}
            data={TECHNOLOGY_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            {...form.getInputProps("category")}
          />
          <TagsInput label={t("technologies.aliases")} {...form.getInputProps("aliases")} />
          <TextInput label={t("common.website")} type="url" {...form.getInputProps("website")} />
          <Textarea
            label={t("common.description")}
            autosize
            minRows={3}
            {...form.getInputProps("description")}
          />
          <TagInput
            value={form.values.tag_ids}
            onChange={(ids) => form.setFieldValue("tag_ids", ids)}
          />
          <Button type="submit" loading={save.isPending}>
            {tc("common.save")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function TechnologiesPage() {
  const { t } = useTranslation("directory");
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [category, setCategory] = useState<TechnologyCategory | null>(null);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ technology?: Technology } | null>(null);
  const archive = useArchiveTechnology();
  const technologies = useTechnologies({
    q: debounced || undefined,
    category: category ?? undefined,
    include_archived: archived,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Group align="flex-end">
          <TextInput
            aria-label={t("common.search")}
            placeholder={t("technologies.searchPlaceholder")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select
            aria-label={t("technologies.category")}
            placeholder={t("technologies.allCategories")}
            clearable
            data={TECHNOLOGY_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            value={category}
            onChange={(v) => {
              setCategory(v as TechnologyCategory | null);
              setPage(1);
            }}
          />
          <Switch
            label={t("common.showArchived")}
            checked={archived}
            onChange={(e) => setArchived(e.currentTarget.checked)}
          />
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({})}>
          {t("technologies.create")}
        </Button>
      </Group>
      <EntityTable
        loading={technologies.isPending}
        rows={technologies.data?.items}
        total={technologies.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        emptyText={t("technologies.empty")}
        columns={[
          {
            key: "name",
            header: t("technologies.name"),
            render: (tech) => (
              <Group gap="xs">
                <span>{tech.name}</span>
                {tech.archived_at && (
                  <Badge size="xs" color="gray">
                    {t("common.archived")}
                  </Badge>
                )}
              </Group>
            ),
          },
          {
            key: "category",
            header: t("technologies.category"),
            render: (tech) => t(`categories.${tech.category}`),
          },
          {
            key: "aliases",
            header: t("technologies.aliases"),
            render: (tech) => tech.aliases.join(", "),
          },
          {
            key: "tags",
            header: t("tags.label"),
            render: (tech) => <TagBadges tags={tech.tags} />,
          },
          {
            key: "actions",
            header: "",
            width: 90,
            render: (tech) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("actions.editOf", { name: tech.name })}
                  onClick={() => setEditing({ technology: tech })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  aria-label={t(tech.archived_at ? "actions.restoreOf" : "actions.archiveOf", {
                    name: tech.name,
                  })}
                  onClick={() =>
                    archive.mutate(
                      { id: tech.id, archived: !tech.archived_at },
                      { onError: notify.error },
                    )
                  }
                >
                  {tech.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {editing && (
        <TechnologyModal technology={editing.technology} onClose={() => setEditing(null)} />
      )}
    </Stack>
  );
}
