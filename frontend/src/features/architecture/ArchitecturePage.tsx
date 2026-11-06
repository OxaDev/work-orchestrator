import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTopologyStar3,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { MarkdownView } from "../../components/MarkdownView";
import { useNotify } from "../directory/useNotify";
import { EntityDocuments } from "../documents/EntityDocuments";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import {
  type ArchitectureDetail,
  useArchitecture,
  useArchiveArchitecture,
  useDeleteArchitecture,
  useDomains,
  useGraph,
  useMember,
} from "./api";
import { ArchitectureModal } from "./ArchitectureModal";
import { DomainForm } from "./DomainForm";
import { DomainTree } from "./DomainTree";
import { LIFECYCLE_COLORS } from "./kinds";

function ArchitectureView({ architecture }: { architecture: ArchitectureDetail }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const navigate = useNavigate();
  const graph = useGraph(architecture.id);
  const domains = useDomains({ company_id: architecture.company.id });
  const member = useMember(architecture.id);
  const archive = useArchiveArchitecture(architecture.id);
  const remove = useDeleteArchitecture(architecture.id);
  const [editing, setEditing] = useState(false);
  const [creatingDomain, setCreatingDomain] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inGraph = new Set((graph.data?.nodes ?? []).map((n) => n.id));
  const candidates = (domains.data ?? []).filter((d) => !inGraph.has(d.id));
  const members = new Set(architecture.members.map((m) => m.id));

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/architecture">
          {t("title")}
        </Anchor>
        <Anchor component={Link} to={`/architecture?company=${architecture.company.id}`}>
          {architecture.company.name}
        </Anchor>
        <Text>{architecture.name}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Group gap="sm">
            <Title order={2}>{architecture.name}</Title>
            <Badge variant="light" color={LIFECYCLE_COLORS[architecture.lifecycle]}>
              {t(`lifecycles.${architecture.lifecycle}`)}
            </Badge>
            {architecture.archived_at && <Text c="dimmed">{t("archived")}</Text>}
          </Group>
          <Group gap={6}>
            <Text size="sm" c="dimmed">
              {t("fields.missions")} :
            </Text>
            {architecture.missions.length ? (
              architecture.missions.map((m) => (
                <Anchor key={m.id} component={Link} to={`/missions/${m.id}`} size="sm">
                  {m.name}
                </Anchor>
              ))
            ) : (
              <Text size="sm">—</Text>
            )}
          </Group>
        </Stack>
        <Group gap="xs">
          <Button
            component={Link}
            to={`/architecture/architectures/${architecture.id}/graph`}
            leftSection={<IconTopologyStar3 size={16} />}
          >
            {t("graph.open")}
          </Button>
          <Button
            variant="default"
            leftSection={<IconPencil size={16} />}
            onClick={() => setEditing(true)}
          >
            {t("edit")}
          </Button>
          <Button
            variant="default"
            leftSection={
              architecture.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />
            }
            onClick={() => archive.mutate(!architecture.archived_at, { onError: notify.error })}
          >
            {t(architecture.archived_at ? "restore" : "archive")}
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
      <Tabs defaultValue="domains" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="domains">
            {t("tabs.domainsCount", { count: graph.data?.nodes.length ?? 0 })}
          </Tabs.Tab>
          <Tabs.Tab value="description">{t("tabs.description")}</Tabs.Tab>
          <Tabs.Tab value="documents">{t("tabs.documents")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="domains" pt="md">
          <Stack>
            <Alert color="blue" icon={<IconInfoCircle size={18} />}>
              {t("architectures.membershipHelp")}
            </Alert>
            {graph.isPending ? (
              <Loader size="sm" />
            ) : (
              <DomainTree
                label={t("architectures.tree")}
                domains={(graph.data?.nodes ?? []).map((n) => ({ ...n }))}
                actions={(domain) =>
                  members.has(domain.id) ? (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t("architectures.removeOf", { name: domain.name })}
                      onClick={() =>
                        member.mutate(
                          { domainId: domain.id, member: false },
                          { onError: notify.error },
                        )
                      }
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null
                }
              />
            )}
            <Group align="flex-end">
              <Select
                label={t("architectures.add")}
                placeholder={t("architectures.addPlaceholder")}
                searchable
                value={null}
                data={candidates.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(value) =>
                  value &&
                  member.mutate({ domainId: value, member: true }, { onError: notify.error })
                }
                w={320}
              />
              <Button
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setCreatingDomain(true)}
              >
                {t("domains.create")}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="description" pt="md">
          <MarkdownView source={architecture.description} empty={t("domains.noDescription")} />
        </Tabs.Panel>
        <Tabs.Panel value="documents" pt="md">
          <EntityDocuments type="architecture" id={architecture.id} />
        </Tabs.Panel>
      </Tabs>
      {editing && (
        <ArchitectureModal architecture={architecture} onClose={() => setEditing(false)} />
      )}
      {creatingDomain && (
        <DomainForm
          companyId={architecture.company.id}
          architectureId={architecture.id}
          onClose={() => setCreatingDomain(false)}
        />
      )}
      <ConfirmDialog
        opened={deleting}
        title={t("deleteTitle")}
        message={t("architectures.deleteMessage", { name: architecture.name })}
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => void navigate("/architecture", { replace: true }),
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

/** /architecture/architectures/:architectureId (P8-8). */
export function ArchitecturePage() {
  const { architectureId = "" } = useParams();
  const architecture = useArchitecture(architectureId);
  if (architecture.isPending) return <Loader size="sm" />;
  if (!architecture.data) return <NotFoundPage />;
  return <ArchitectureView key={architecture.data.id} architecture={architecture.data} />;
}
