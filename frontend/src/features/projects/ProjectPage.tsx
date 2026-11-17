import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { MarkdownView } from "../../components/MarkdownView";
import { useNotify } from "../directory/useNotify";
import { useDocuments } from "../documents/api";
import { DocumentTree } from "../documents/DocumentTree";
import { NewDocumentModal } from "../documents/NewDocumentModal";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import {
  type ProjectSummary,
  projectPath,
  useArchiveProject,
  useDeleteProject,
  useProject,
} from "./api";
import { ProjectArchitectures } from "./ProjectArchitectures";
import { ProjectModal } from "./ProjectModal";
import { useWorkContext } from "./scope";

const TABS = ["documents", "architectures", "about"] as const;
type Tab = (typeof TABS)[number];

function ProjectDocuments({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation("documents");
  const documents = useDocuments({ project_id: project.id });
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  if (documents.isPending) return <Loader size="sm" />;
  return (
    <Stack>
      <Group>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating({ parentId: null })}
        >
          {t("create")}
        </Button>
      </Group>
      <DocumentTree
        documents={documents.data ?? []}
        groups={[{ projectId: project.id }]}
        onCreateChild={(parent) => setCreating({ parentId: parent.id })}
        empty={
          <Text size="sm" c="dimmed">
            {t("emptyList")}
          </Text>
        }
      />
      {creating && (
        <NewDocumentModal
          parentId={creating.parentId}
          projectId={project.id}
          onClose={() => setCreating(null)}
        />
      )}
    </Stack>
  );
}

/** /missions/:missionId/projects/:projectId/:tab — a project's documents and architectures; opening
 * it makes it the current work context (ADR-0042). */
export function ProjectPage() {
  const { t } = useTranslation("projects");
  const { projectId = "", tab } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const project = useProject(projectId);
  const archive = useArchiveProject(projectId);
  const remove = useDeleteProject(projectId);
  const { setScope } = useWorkContext();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const data = project.data;

  useEffect(() => {
    if (data) setScope({ missionId: data.mission.id, projectId: data.id });
  }, [data, setScope]);

  if (project.isPending) return <Loader size="sm" />;
  if (!data) return <NotFoundPage />;
  const current: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "documents";

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/missions">
          {t("missions:title")}
        </Anchor>
        <Anchor component={Link} to={`/missions/${data.mission.id}?tab=projects`}>
          {data.mission.name}
        </Anchor>
        <Text>{data.name}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{data.name}</Title>
          <Text size="sm" c="dimmed">
            {data.client.name} ·{" "}
            {t("counts", {
              documents: data.document_count,
              architectures: data.architecture_count,
            })}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconEdit size={16} />}
            onClick={() => setEditing(true)}
          >
            {t("edit")}
          </Button>
          <Button
            variant="default"
            leftSection={
              data.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />
            }
            loading={archive.isPending}
            onClick={() => archive.mutate(!data.archived_at, { onError: notify.error })}
          >
            {t(data.archived_at ? "restore" : "archive")}
          </Button>
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setDeleting(true)}
          >
            {t("delete")}
          </Button>
        </Group>
      </Group>
      {data.archived_at && <Alert color="gray">{t("archivedNotice")}</Alert>}
      <Tabs
        value={current}
        onChange={(value) =>
          void navigate(projectPath(data, value ?? undefined), { replace: true })
        }
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="documents">
            {t("tabs.documents", { count: data.document_count })}
          </Tabs.Tab>
          <Tabs.Tab value="architectures">
            {t("tabs.architectures", { count: data.architecture_count })}
          </Tabs.Tab>
          <Tabs.Tab value="about">{t("tabs.about")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="documents" pt="md">
          <ProjectDocuments project={data} />
        </Tabs.Panel>
        <Tabs.Panel value="architectures" pt="md">
          <ProjectArchitectures project={data} />
        </Tabs.Panel>
        <Tabs.Panel value="about" pt="md">
          <MarkdownView source={data.description} empty={t("noDescription")} />
        </Tabs.Panel>
      </Tabs>
      {editing && (
        <ProjectModal
          missionId={data.mission.id}
          project={data}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        opened={deleting}
        title={t("deleteTitle")}
        message={t("deleteMessage", { name: data.name })}
        confirmLabel={t("delete")}
        danger
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setScope({ missionId: data.mission.id, projectId: null });
              void navigate(`/missions/${data.mission.id}?tab=projects`, { replace: true });
            },
            onError: (error) => {
              setDeleting(false);
              notify.error(error);
            },
          })
        }
      />
    </Stack>
  );
}
