import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconCalendarSearch,
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { buildTree, type TreeNode } from "../../components/tree";
import { todayIso } from "../agenda/calendar";
import { formatDuration } from "../agenda/duration";
import { useNotify } from "../directory/useNotify";
import {
  type Subject,
  type SubjectScope,
  SUBJECT_STATUS_COLORS,
  useArchiveSubject,
  useCategories,
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
} from "./api";
import { SubjectModal } from "./SubjectModal";

/** One-line form used for roots and for quick sub-subjects (P5-3). */
function QuickAdd({
  label,
  placeholder,
  loading,
  onAdd,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  loading: boolean;
  onAdd: (title: string) => Promise<unknown>;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation("subjects");
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    void onAdd(title.trim()).then(() => setTitle(""));
  };
  return (
    <form onSubmit={submit} noValidate>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          aria-label={label}
          placeholder={placeholder}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          style={{ flex: 1 }}
          size="xs"
          data-autofocus={autoFocus || undefined}
          autoFocus={autoFocus}
        />
        <ActionIcon type="submit" aria-label={t("add")} loading={loading} variant="light">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
    </form>
  );
}

/**
 * Collapsible subject tree for one scope (and mission), with quick creation of sub-subjects.
 * Children repeat their parent's scope and mission (RG-07).
 */
export function SubjectsPanel({ scope, missionId }: { scope: SubjectScope; missionId?: string }) {
  const { t, i18n } = useTranslation("subjects");
  const notify = useNotify();
  const [showArchived, setShowArchived] = useState(false);
  const subjects = useSubjects({
    scope,
    mission_id: missionId,
    include_archived: showArchived,
  });
  const categories = useCategories();
  const create = useCreateSubject();
  const archive = useArchiveSubject();
  const remove = useDeleteSubject();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const items = subjects.data ?? [];
  const categoryName = new Map(
    (categories.data ?? []).map((c) => [c.id, i18n.language === "en" ? c.name_en : c.name_fr]),
  );
  const add = (title: string, parentId: string | null) =>
    create.mutateAsync(
      {
        title,
        scope,
        mission_id: missionId ?? null,
        parent_id: parentId,
        status: "OPEN",
        description: "",
      },
      { onError: notify.error },
    );
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (node: TreeNode<Subject>): ReactNode => {
    const subject = node.item;
    const open = !collapsed.has(subject.id);
    const hasChildren = node.children.length > 0;
    return (
      <Box
        component="li"
        key={subject.id}
        role="treeitem"
        aria-level={node.depth + 1}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={subject.title}
      >
        <Group
          justify="space-between"
          wrap="nowrap"
          py={4}
          pl={node.depth * 22}
          style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
        >
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            {hasChildren ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={t(open ? "collapse" : "expand", { title: subject.title })}
                onClick={() => toggle(subject.id)}
              >
                {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </ActionIcon>
            ) : (
              <Box w={22} />
            )}
            <Text
              size="sm"
              truncate
              td={subject.archived_at ? "line-through" : undefined}
              c={subject.archived_at ? "dimmed" : undefined}
            >
              {subject.title}
            </Text>
            <Badge size="xs" variant="light" color={SUBJECT_STATUS_COLORS[subject.status]}>
              {t(`status.${subject.status}`)}
            </Badge>
            {subject.category_id && categoryName.get(subject.category_id) && (
              <Badge size="xs" variant="outline" color="gray">
                {categoryName.get(subject.category_id)}
              </Badge>
            )}
            {subject.task_count > 0 && (
              <Text size="xs" c="dimmed">
                {t("taskCount", { count: subject.task_count })}
                {subject.done_minutes > 0 &&
                  ` · ${t("spent", { duration: formatDuration(subject.done_minutes) })}`}
              </Text>
            )}
            {subject.external_url && (
              <Anchor
                href={subject.external_url}
                target="_blank"
                rel="noreferrer"
                aria-label={t("openLink", { title: subject.title })}
              >
                <IconExternalLink size={14} />
              </Anchor>
            )}
          </Group>
          <Group gap={2} wrap="nowrap">
            {!subject.archived_at && (
              <ActionIcon
                variant="subtle"
                aria-label={t("addChildOf", { title: subject.title })}
                onClick={() => setAddingTo(addingTo === subject.id ? null : subject.id)}
              >
                <IconPlus size={16} />
              </ActionIcon>
            )}
            <ActionIcon
              variant="subtle"
              component={Link}
              to={`/agenda/week/${todayIso()}?subject=${subject.id}`}
              aria-label={t("inAgendaOf", { title: subject.title })}
            >
              <IconCalendarSearch size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={t("editOf", { title: subject.title })}
              onClick={() => setEditing(subject)}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={t(subject.archived_at ? "restoreOf" : "archiveOf", {
                title: subject.title,
              })}
              onClick={() =>
                archive.mutate(
                  { id: subject.id, archived: !subject.archived_at },
                  { onError: notify.error },
                )
              }
            >
              {subject.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("deleteOf", { title: subject.title })}
              onClick={() => setDeleting(subject)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>
        {addingTo === subject.id && (
          <Box pl={node.depth * 22 + 28} py={4}>
            <QuickAdd
              autoFocus
              label={t("addChildOf", { title: subject.title })}
              placeholder={t("childPlaceholder")}
              loading={create.isPending}
              onAdd={async (title) => {
                await add(title, subject.id);
                setCollapsed((current) => {
                  const next = new Set(current);
                  next.delete(subject.id);
                  return next;
                });
                setAddingTo(null);
              }}
            />
          </Box>
        )}
        {hasChildren && open && (
          <Box component="ul" role="group" m={0} p={0} style={{ listStyle: "none" }}>
            {node.children.map(renderNode)}
          </Box>
        )}
      </Box>
    );
  };

  const roots = buildTree(items, (a, b) => a.title.localeCompare(b.title));
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Box style={{ flex: 1, maxWidth: 480 }}>
          <QuickAdd
            label={t("newRoot")}
            placeholder={t("newRootPlaceholder")}
            loading={create.isPending && addingTo === null}
            onAdd={(title) => add(title, null)}
          />
        </Box>
        <Switch
          size="xs"
          label={t("showArchived")}
          checked={showArchived}
          onChange={(event) => setShowArchived(event.currentTarget.checked)}
        />
      </Group>
      {subjects.isPending ? (
        <Loader size="sm" />
      ) : roots.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("empty")}
        </Text>
      ) : (
        <Box
          component="ul"
          role="tree"
          aria-label={t("treeLabel")}
          m={0}
          p={0}
          style={{ listStyle: "none" }}
        >
          {roots.map(renderNode)}
        </Box>
      )}
      {editing && (
        <SubjectModal
          subject={editing}
          siblings={items.filter((s) => !s.archived_at)}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        opened={deleting !== null}
        title={t("deleteTitle")}
        message={t("deleteMessage", { title: deleting?.title ?? "" })}
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
