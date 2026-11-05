import {
  ActionIcon,
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  ColorSwatch,
  Group,
  Loader,
  Rating,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Timeline,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconArchive, IconArchiveOff, IconBulb, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useNotify } from "../directory/useNotify";
import {
  type MissionDetail,
  useArchiveMission,
  useDeleteMission,
  useDeleteMissionContact,
  useDeleteMissionTechnology,
  useMission,
  usePutMissionContact,
  usePutMissionTechnology,
  useUpdateMission,
} from "./api";
import { ContactSearchSelect, RoleSelect, StatusBadge, TechnologySearchSelect } from "./components";
import { formatDate } from "./format";
import { MissionForm } from "./MissionForm";

function MissionContacts({ mission }: { mission: MissionDetail }) {
  const { t, i18n } = useTranslation("missions");
  const notify = useNotify();
  const put = usePutMissionContact(mission.id);
  const remove = useDeleteMissionContact(mission.id);
  const form = useForm({
    initialValues: { contact_id: null as string | null, role_id: null as string | null },
    validate: { contact_id: (v) => (v ? null : t("validation.required")) },
  });
  const roleName = (role: MissionDetail["contacts"][number]["role"]) =>
    role ? (i18n.language === "en" ? role.name_en : role.name_fr) : "";

  return (
    <Stack>
      {mission.contacts.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t("contacts.empty")}
        </Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("contacts.name")}</Table.Th>
              <Table.Th>{t("contacts.role")}</Table.Th>
              <Table.Th>{t("contacts.company")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {mission.contacts.map((link) => (
              <Table.Tr key={link.contact.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/directory/contacts/${link.contact.id}`}>
                    {link.contact.name}
                  </Anchor>
                  {link.job_title && (
                    <Text size="xs" c="dimmed">
                      {link.job_title}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <RoleSelect
                    aria-label={t("contacts.roleOf", { name: link.contact.name })}
                    size="xs"
                    value={link.role?.id ?? null}
                    placeholder={roleName(link.role) || t("contacts.noRole")}
                    onChange={(role_id) =>
                      put.mutate(
                        { contactId: link.contact.id, role_id, note: link.note },
                        { onError: notify.error },
                      )
                    }
                  />
                </Table.Td>
                <Table.Td>{link.company?.name}</Table.Td>
                <Table.Td w={40}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t("contacts.removeOf", { name: link.contact.name })}
                    onClick={() => remove.mutate(link.contact.id, { onError: notify.error })}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          put.mutate(
            { contactId: v.contact_id!, role_id: v.role_id },
            { onSuccess: () => form.reset(), onError: notify.error },
          ),
        )}
      >
        <Group align="flex-end">
          <ContactSearchSelect
            label={t("contacts.add")}
            miw={280}
            {...form.getInputProps("contact_id")}
          />
          <RoleSelect label={t("contacts.role")} {...form.getInputProps("role_id")} />
          <Button type="submit" variant="light" loading={put.isPending}>
            {t("contacts.addButton")}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}

function MissionTechnologies({ mission }: { mission: MissionDetail }) {
  const { t } = useTranslation("missions");
  const { t: td } = useTranslation("directory");
  const notify = useNotify();
  const put = usePutMissionTechnology(mission.id);
  const remove = useDeleteMissionTechnology(mission.id);
  const form = useForm({
    initialValues: { technology_id: null as string | null, weight: 3, version: "" },
    validate: { technology_id: (v) => (v ? null : t("validation.required")) },
  });

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t("technologies.help")}
      </Text>
      {mission.technologies.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t("technologies.empty")}
        </Text>
      ) : (
        <Table>
          <Table.Tbody>
            {mission.technologies.map((link) => (
              <Table.Tr key={link.technology.id}>
                <Table.Td>
                  <Text size="sm">{link.technology.name}</Text>
                  <Text size="xs" c="dimmed">
                    {td(`categories.${link.category}`)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Rating
                    aria-label={t("technologies.weightOf", { name: link.technology.name })}
                    value={link.weight}
                    onChange={(weight) =>
                      put.mutate(
                        {
                          technologyId: link.technology.id,
                          weight,
                          version: link.version,
                          note: link.note,
                        },
                        { onError: notify.error },
                      )
                    }
                  />
                </Table.Td>
                <Table.Td>{link.version}</Table.Td>
                <Table.Td w={40}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t("technologies.removeOf", { name: link.technology.name })}
                    onClick={() => remove.mutate(link.technology.id, { onError: notify.error })}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <form
        noValidate
        onSubmit={form.onSubmit((v) =>
          put.mutate(
            { technologyId: v.technology_id!, weight: v.weight, version: v.version.trim() || null },
            { onSuccess: () => form.reset(), onError: notify.error },
          ),
        )}
      >
        <Group align="flex-end">
          <TechnologySearchSelect
            label={t("technologies.add")}
            {...form.getInputProps("technology_id")}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t("technologies.weight")}
            </Text>
            <Rating
              aria-label={t("technologies.weight")}
              value={form.values.weight}
              onChange={(w) => form.setFieldValue("weight", w)}
            />
          </Stack>
          <TextInput label={t("technologies.version")} w={120} {...form.getInputProps("version")} />
          <Button type="submit" variant="light" loading={put.isPending}>
            {t("technologies.addButton")}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}

function EndDateHistory({ mission }: { mission: MissionDetail }) {
  const { t, i18n } = useTranslation("missions");
  if (mission.end_date_changes.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {t("history.empty")}
      </Text>
    );
  }
  return (
    <Timeline bulletSize={16} lineWidth={2}>
      {mission.end_date_changes.map((change) => (
        <Timeline.Item
          key={change.changed_at}
          title={t("history.change", {
            from: formatDate(change.old_date, i18n.language) || "—",
            to: formatDate(change.new_date, i18n.language) || "—",
          })}
        >
          <Text size="xs" c="dimmed">
            {formatDate(change.changed_at.slice(0, 10), i18n.language)}
            {change.note && ` · ${change.note}`}
          </Text>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

export function MissionPage() {
  const { t, i18n } = useTranslation("missions");
  const errorMessage = useErrorMessage();
  const notify = useNotify();
  const navigate = useNavigate();
  const { missionId = "" } = useParams();
  const mission = useMission(missionId);
  const update = useUpdateMission(missionId);
  const archive = useArchiveMission(missionId);
  const remove = useDeleteMission(missionId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (mission.isPending) return <Loader size="sm" />;
  if (mission.isError) return <Alert color="red">{errorMessage(mission.error)}</Alert>;
  const data = mission.data;
  const end = data.actual_end_date ?? data.planned_end_date;

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/missions">
          {t("title")}
        </Anchor>
        <Text>{data.title}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <ColorSwatch color={`var(--mantine-color-${data.color}-6)`} size={14} />
            <Title order={3}>{data.title}</Title>
            <StatusBadge status={data.status} />
            {data.archived_at && <Text c="dimmed">{t("archived")}</Text>}
          </Group>
          <Text c="dimmed" size="sm">
            {data.job_title} ·{" "}
            <Anchor component={Link} to={`/directory/companies/${data.client.id}`} size="sm">
              {data.client.name}
            </Anchor>{" "}
            · {t("via", { employer: data.employer.name })}
          </Text>
          <Text size="sm">
            {end
              ? t("period", {
                  start: formatDate(data.start_date, i18n.language),
                  end: formatDate(end, i18n.language),
                })
              : t("since", { start: formatDate(data.start_date, i18n.language) })}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={
              data.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />
            }
            loading={archive.isPending}
            onClick={() => archive.mutate(!data.archived_at)}
          >
            {t(data.archived_at ? "restore" : "archive")}
          </Button>
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setConfirmDelete(true)}
          >
            {t("delete")}
          </Button>
        </Group>
      </Group>
      {data.suggested_status && (
        <Alert color="blue" icon={<IconBulb size={18} />}>
          <Group justify="space-between">
            <Text size="sm">
              {t("suggestion", { status: t(`status.${data.suggested_status}`) })}
            </Text>
            <Button
              size="xs"
              variant="light"
              loading={update.isPending}
              onClick={() =>
                update.mutate({ status: data.suggested_status! }, { onError: notify.error })
              }
            >
              {t("applySuggestion")}
            </Button>
          </Group>
        </Alert>
      )}
      <Tabs defaultValue="info" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="info">{t("tabs.info")}</Tabs.Tab>
          <Tabs.Tab value="contacts">
            {t("tabs.contacts")} ({data.contacts.length})
          </Tabs.Tab>
          <Tabs.Tab value="technologies">
            {t("tabs.technologies")} ({data.technologies.length})
          </Tabs.Tab>
          <Tabs.Tab value="history">{t("tabs.history")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="info" pt="md">
          <MissionForm
            key={`${data.id}-${data.status}`}
            mission={data}
            submitting={update.isPending}
            onSubmit={(changes) =>
              update.mutate(changes, { onSuccess: notify.saved, onError: notify.error })
            }
          />
        </Tabs.Panel>
        <Tabs.Panel value="contacts" pt="md">
          <MissionContacts mission={data} />
        </Tabs.Panel>
        <Tabs.Panel value="technologies" pt="md">
          <MissionTechnologies mission={data} />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="md">
          <EndDateHistory mission={data} />
        </Tabs.Panel>
      </Tabs>
      <ConfirmDialog
        opened={confirmDelete}
        title={t("deleteTitle")}
        message={t("deleteMessage", { title: data.title })}
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => void navigate("/missions", { replace: true }),
            onError: (error) => {
              setConfirmDelete(false);
              notify.error(error);
            },
          })
        }
      />
    </Stack>
  );
}
