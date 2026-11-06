import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { MarkdownView } from "../../components/MarkdownView";
import { todayIso } from "../agenda/calendar";
import { formatDuration } from "../agenda/duration";
import { dayPath } from "../agenda/micro";
import { useNotify } from "../directory/useNotify";
import { EntityDocuments } from "../documents/EntityDocuments";
import { TechnologySearchSelect } from "../missions/components";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import { subjectPaths, useSubjects } from "../subjects/api";
import {
  type DomainDetail,
  type Relation,
  useArchiveDomain,
  useDeleteDomain,
  useDeleteRelation,
  useDomain,
  useDomainSubject,
  useDomainTasks,
  useDomainTechnology,
} from "./api";
import { DomainBadges, DomainLabel } from "./DomainLabel";
import { DomainForm } from "./DomainForm";
import { ExternalLinks } from "./ExternalLinks";
import { KIND_ICONS } from "./kinds";
import { RelationModal } from "./RelationModal";

function RelationsTable({
  relations,
  side,
  onEdit,
}: {
  relations: readonly Relation[];
  side: "target" | "source";
  onEdit: (relation: Relation) => void;
}) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const remove = useDeleteRelation();
  if (!relations.length) {
    return (
      <Text size="sm" c="dimmed">
        {t("relations.empty")}
      </Text>
    );
  }
  return (
    <Table>
      <Table.Tbody>
        {relations.map((relation) => (
          <Table.Tr key={relation.id}>
            <Table.Td>
              {relation.type === "CUSTOM" ? relation.label : t(`relationTypes.${relation.type}`)}
            </Table.Td>
            <Table.Td>
              <DomainLabel domain={relation[side]} />
            </Table.Td>
            <Table.Td>
              <Group gap={4}>
                {relation.protocol && (
                  <Badge size="xs" variant="light">
                    {relation.protocol}
                  </Badge>
                )}
                {relation.sync_mode && (
                  <Badge size="xs" variant="outline" color="gray">
                    {t(`syncModes.${relation.sync_mode}`)}
                  </Badge>
                )}
                {relation.lifecycle !== "CURRENT" && (
                  <Badge size="xs" variant="light" color="blue">
                    {t(`lifecycles.${relation.lifecycle}`)}
                  </Badge>
                )}
              </Group>
            </Table.Td>
            <Table.Td w={80}>
              <Group gap={2} justify="flex-end" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t("relations.editOf", { name: relation[side].name })}
                  onClick={() => onEdit(relation)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("relations.deleteOf", { name: relation[side].name })}
                  onClick={() => remove.mutate(relation.id, { onError: notify.error })}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Technologies({ domain }: { domain: DomainDetail }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const technology = useDomainTechnology(domain.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  return (
    <Stack gap="xs">
      {domain.technologies.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("technologies.empty")}
        </Text>
      )}
      {domain.technologies.map((item) => (
        <Group key={item.technology.id} justify="space-between">
          <Text size="sm">
            {item.technology.name}
            {item.version && ` ${item.version}`}
          </Text>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t("technologies.removeOf", { name: item.technology.name })}
            onClick={() =>
              technology.mutate(
                { technologyId: item.technology.id, remove: true },
                { onError: notify.error },
              )
            }
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Group align="flex-end" gap="xs">
        <TechnologySearchSelect label={t("technologies.add")} value={picked} onChange={setPicked} />
        <TextInput
          label={t("technologies.version")}
          w={120}
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
        />
        <Button
          variant="light"
          disabled={!picked}
          onClick={() =>
            technology.mutate(
              { technologyId: picked!, version: version.trim() || null },
              {
                onSuccess: () => {
                  setPicked(null);
                  setVersion("");
                },
                onError: notify.error,
              },
            )
          }
        >
          {t("technologies.addAction")}
        </Button>
      </Group>
    </Stack>
  );
}

function SubjectsAndTasks({ domain }: { domain: DomainDetail }) {
  const { t, i18n } = useTranslation("architecture");
  const notify = useNotify();
  const link = useDomainSubject(domain.id);
  const subjects = useSubjects();
  const tasks = useDomainTasks(domain.id);
  const linked = new Set(domain.subjects.map((s) => s.id));
  const paths = subjectPaths(subjects.data ?? []);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return (
    <Stack>
      <Stack gap="xs">
        <Title order={5}>{t("subjects.title")}</Title>
        {domain.subjects.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("subjects.empty")}
          </Text>
        )}
        {domain.subjects.map((subject) => (
          <Group key={subject.id} justify="space-between">
            <Anchor component={Link} to={`/subjects/${subject.id}`} size="sm">
              {subject.title}
            </Anchor>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("subjects.unlinkOf", { title: subject.title })}
              onClick={() =>
                link.mutate({ subjectId: subject.id, linked: false }, { onError: notify.error })
              }
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Select
          label={t("subjects.link")}
          searchable
          value={null}
          data={(subjects.data ?? [])
            .filter((s) => !linked.has(s.id))
            .map((s) => ({ value: s.id, label: paths.get(s.id) ?? s.title }))}
          onChange={(value) =>
            value && link.mutate({ subjectId: value, linked: true }, { onError: notify.error })
          }
        />
      </Stack>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={5}>{t("subjects.tasks")}</Title>
          <Button
            size="xs"
            variant="light"
            component={Link}
            to={`/agenda/week/${tasks.data?.[0]?.date ?? todayIso()}?domain=${domain.id}`}
          >
            {t("subjects.inAgenda")}
          </Button>
        </Group>
        {(tasks.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("subjects.noTask")}
          </Text>
        ) : (
          <Table>
            <Table.Tbody>
              {tasks.data!.map((task) => (
                <Table.Tr key={task.id}>
                  <Table.Td>
                    <Anchor component={Link} to={dayPath(task.date)} size="sm">
                      {dateFormat.format(new Date(`${task.date}T00:00:00Z`))}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{task.title}</Table.Td>
                  <Table.Td>{task.subject.title}</Table.Td>
                  <Table.Td>{formatDuration(task.duration_minutes)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Stack>
  );
}

function DomainView({ domain }: { domain: DomainDetail }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const navigate = useNavigate();
  const archive = useArchiveDomain(domain.id);
  const remove = useDeleteDomain(domain.id);
  const [editing, setEditing] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [relation, setRelation] = useState<{
    relation?: Relation;
    direction?: "outgoing" | "incoming";
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const Icon = KIND_ICONS[domain.kind];

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to={`/architecture?tab=domains&company=${domain.company.id}`}>
          {domain.company.name}
        </Anchor>
        {domain.ancestors.map((a) => (
          <Anchor key={a.id} component={Link} to={`/architecture/domains/${a.id}`}>
            {a.name}
          </Anchor>
        ))}
        <Text>{domain.name}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Group gap="sm">
            <Icon size={24} stroke={1.6} />
            <Title order={2}>{domain.name}</Title>
            <Badge variant="light">{t(`kinds.${domain.kind}`)}</Badge>
            <DomainBadges domain={domain} />
            {domain.archived_at && <Text c="dimmed">{t("archived")}</Text>}
          </Group>
          {domain.architectures.length > 0 && (
            <Group gap={6}>
              <Text size="sm" c="dimmed">
                {t("domains.inArchitectures")}
              </Text>
              {domain.architectures.map((a) => (
                <Anchor
                  key={a.id}
                  component={Link}
                  to={`/architecture/architectures/${a.id}`}
                  size="sm"
                >
                  {a.name}
                </Anchor>
              ))}
            </Group>
          )}
        </Stack>
        <Group gap="xs">
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
              domain.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />
            }
            onClick={() => archive.mutate(!domain.archived_at, { onError: notify.error })}
          >
            {t(domain.archived_at ? "restore" : "archive")}
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

      <Tabs defaultValue="overview" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">{t("tabs.overview")}</Tabs.Tab>
          <Tabs.Tab value="children">
            {t("tabs.children", { count: domain.children.length })}
          </Tabs.Tab>
          <Tabs.Tab value="relations">
            {t("tabs.relations", { count: domain.outgoing.length + domain.incoming.length })}
          </Tabs.Tab>
          <Tabs.Tab value="technologies">
            {t("tabs.technologies", { count: domain.technologies.length })}
          </Tabs.Tab>
          <Tabs.Tab value="subjects">
            {t("tabs.subjects", { count: domain.subjects.length })}
          </Tabs.Tab>
          <Tabs.Tab value="documents">{t("tabs.documents")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack>
            <MarkdownView source={domain.description} empty={t("domains.noDescription")} />
            <Card withBorder>
              <Stack gap="xs">
                <Title order={5}>{t("owner.title")}</Title>
                {domain.owner_chain.length ? (
                  <Box component="nav" aria-label={t("owner.chain")}>
                    <Breadcrumbs separator="›">
                      {domain.owner_chain.map((unit) => (
                        <Text key={unit.id} size="sm">
                          {unit.level_label ? `${unit.level_label} ${unit.name}` : unit.name}
                        </Text>
                      ))}
                    </Breadcrumbs>
                  </Box>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("owner.none")}
                  </Text>
                )}
                {domain.referent_contact && (
                  <Text size="sm">
                    {t("owner.referent")}{" "}
                    <Anchor
                      component={Link}
                      to={`/directory/contacts/${domain.referent_contact.id}`}
                    >
                      {domain.referent_contact.name}
                    </Anchor>
                  </Text>
                )}
              </Stack>
            </Card>
            <Card withBorder>
              <Title order={5} mb="xs">
                {t("links.title")}
              </Title>
              <ExternalLinks
                entityType="DOMAIN"
                entityId={domain.id}
                links={domain.external_links}
              />
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="children" pt="md">
          <Stack gap="xs">
            {domain.children.map((child) => (
              <Group key={child.id} gap="xs">
                <DomainLabel domain={child} />
                <DomainBadges domain={child} />
              </Group>
            ))}
            {domain.children.length === 0 && (
              <Text size="sm" c="dimmed">
                {t("domains.noChildren")}
              </Text>
            )}
            <Group>
              <Button
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setCreatingChild(true)}
              >
                {t("domains.createChild")}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="relations" pt="md">
          <Stack>
            <Group justify="space-between">
              <Title order={5}>{t("relations.outgoing")}</Title>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setRelation({ direction: "outgoing" })}
              >
                {t("relations.addOutgoing")}
              </Button>
            </Group>
            <RelationsTable
              relations={domain.outgoing}
              side="target"
              onEdit={(r) => setRelation({ relation: r })}
            />
            <Group justify="space-between">
              <Title order={5}>{t("relations.incoming")}</Title>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setRelation({ direction: "incoming" })}
              >
                {t("relations.addIncoming")}
              </Button>
            </Group>
            <RelationsTable
              relations={domain.incoming}
              side="source"
              onEdit={(r) => setRelation({ relation: r })}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="technologies" pt="md">
          <Technologies domain={domain} />
        </Tabs.Panel>
        <Tabs.Panel value="subjects" pt="md">
          <SubjectsAndTasks domain={domain} />
        </Tabs.Panel>
        <Tabs.Panel value="documents" pt="md">
          <EntityDocuments type="domain" id={domain.id} />
        </Tabs.Panel>
      </Tabs>

      {editing && (
        <DomainForm
          companyId={domain.company_id}
          domain={domain}
          onClose={() => setEditing(false)}
        />
      )}
      {creatingChild && (
        <DomainForm
          companyId={domain.company_id}
          parentId={domain.id}
          onClose={() => setCreatingChild(false)}
        />
      )}
      {relation && (
        <RelationModal
          companyId={domain.company_id}
          domainId={domain.id}
          relation={relation.relation}
          direction={relation.direction}
          onClose={() => setRelation(null)}
        />
      )}
      <ConfirmDialog
        opened={deleting}
        title={t("deleteTitle")}
        message={t("domains.deleteMessage", { name: domain.name })}
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () =>
              void navigate(`/architecture?tab=domains&company=${domain.company_id}`, {
                replace: true,
              }),
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

/** /architecture/domains/:domainId — the domain sheet (P8-9). */
export function DomainPage() {
  const { domainId = "" } = useParams();
  const domain = useDomain(domainId);
  if (domain.isPending) return <Loader size="sm" />;
  if (!domain.data) return <NotFoundPage />;
  return <DomainView key={domain.data.id} domain={domain.data} />;
}
