import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useCreateParam } from "../../app/useCreateParam";
import { useProjects } from "../projects/api";
import { useWorkContext } from "../projects/scope";
import { useDocuments } from "./api";
import { type DocumentGroup, DocumentTree } from "./DocumentTree";
import { MarkdownImportModal } from "./MarkdownImportModal";
import { NewDocumentModal } from "./NewDocumentModal";

type Scope = "project" | "mission" | "unfiled" | "all";

/** /documents — the page tree of the current project by default (ADR-0042), search, creation. */
export function DocumentsPage() {
  const { t } = useTranslation("documents");
  const { missionId, projectId } = useWorkContext();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [archived, setArchived] = useState(false);
  const [chosen, setScope] = useState<Scope | null>(null);
  const [creating, setCreating] = useState<{
    parentId: string | null;
    projectId: string | null;
  } | null>(null);
  const [requested, clearRequest] = useCreateParam();
  const [importing, setImporting] = useState(false);

  const available: Scope[] = [
    ...(projectId ? (["project"] as const) : []),
    ...(missionId ? (["mission"] as const) : []),
    "unfiled",
    "all",
  ];
  const scope: Scope =
    chosen && available.includes(chosen)
      ? chosen
      : projectId
        ? "project"
        : missionId
          ? "mission"
          : "all";
  const projects = useProjects(
    scope === "mission" ? { mission_id: missionId ?? undefined } : {},
    scope === "mission" || scope === "all" || scope === "project",
  );
  const filter =
    scope === "project"
      ? { project_id: projectId ?? undefined }
      : scope === "mission"
        ? { mission_id: missionId ?? undefined }
        : scope === "unfiled"
          ? { unfiled: true }
          : {};
  const documents = useDocuments({
    q: debounced || undefined,
    include_archived: archived,
    ...filter,
  });
  const items = documents.data ?? [];
  const projectList = projects.data?.items ?? [];
  const current = projectList.find((p) => p.id === projectId);
  const defaultProject = scope === "project" ? projectId : null;

  const groupLabel = (id: string | null, name: string) => (
    <Group gap={6}>
      <span>{name}</span>
      <ActionIcon
        size="sm"
        variant="subtle"
        aria-label={t("dnd.createIn", { name })}
        onClick={() => setCreating({ parentId: null, projectId: id })}
      >
        <IconPlus size={14} />
      </ActionIcon>
    </Group>
  );
  const groups: DocumentGroup[] =
    scope === "project"
      ? [{ projectId }]
      : scope === "unfiled"
        ? [{ projectId: null }]
        : [
            ...projectList
              .filter((p) => scope === "mission" || items.some((d) => d.project_id === p.id))
              .map((p) => ({
                projectId: p.id,
                label: groupLabel(p.id, scope === "all" ? `${p.mission.name} › ${p.name}` : p.name),
              })),
            // Pages of projects not listed (archived) stay visible under their own heading.
            ...[...new Set(items.map((d) => d.project_id))]
              .filter((id): id is string => Boolean(id) && !projectList.some((p) => p.id === id))
              .map((id) => ({ projectId: id, label: t("dnd.otherProject") })),
            ...(scope === "all" || items.some((d) => !d.project_id)
              ? [{ projectId: null, label: groupLabel(null, t("scope.unfiled")) }]
              : []),
          ];

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("title")}</Title>
          {scope === "project" && current && (
            <Text size="sm" c="dimmed">
              {current.mission.name} › {current.name}
            </Text>
          )}
        </div>
        <Group gap="xs">
          <Anchor component={Link} to="/documents/graph" size="sm">
            {t("graph.title")}
          </Anchor>
          <Anchor component={Link} to="/documents/templates" size="sm">
            {t("templates.title")}
          </Anchor>
          <Button
            variant="default"
            leftSection={<IconUpload size={16} />}
            onClick={() => setImporting(true)}
          >
            {t("data:markdown.title")}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreating({ parentId: null, projectId: defaultProject })}
          >
            {t("create")}
          </Button>
        </Group>
      </Group>
      <Group>
        <SegmentedControl
          size="xs"
          aria-label={t("scope.label")}
          value={scope}
          onChange={(value) => setScope(value as Scope)}
          data={available.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
        />
        <TextInput
          aria-label={t("search")}
          placeholder={t("search")}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={320}
        />
        <Switch
          size="xs"
          label={t("showArchived")}
          checked={archived}
          onChange={(e) => setArchived(e.currentTarget.checked)}
        />
      </Group>
      {documents.isPending ? (
        <Loader size="sm" />
      ) : (
        <DocumentTree
          documents={items}
          groups={groups}
          onCreateChild={(parent) =>
            setCreating({ parentId: parent.id, projectId: parent.project_id })
          }
          empty={
            <Stack align="flex-start" gap="xs">
              <Text size="sm" c="dimmed">
                {debounced ? t("nothingFound") : t("emptyList")}
              </Text>
              {!debounced && (
                <Group gap="xs">
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setCreating({ parentId: null, projectId: defaultProject })}
                  >
                    {t("create")}
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconUpload size={16} />}
                    onClick={() => setImporting(true)}
                  >
                    {t("data:markdown.title")}
                  </Button>
                </Group>
              )}
            </Stack>
          }
        />
      )}
      {importing && (
        <MarkdownImportModal projectId={defaultProject} onClose={() => setImporting(false)} />
      )}
      {(creating ?? requested) && (
        <NewDocumentModal
          parentId={creating?.parentId ?? null}
          projectId={creating ? creating.projectId : defaultProject}
          onClose={() => {
            setCreating(null);
            clearRequest();
          }}
        />
      )}
    </Stack>
  );
}
