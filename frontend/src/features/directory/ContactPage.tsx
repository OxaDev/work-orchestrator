import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconArchive, IconArchiveOff, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { MarkdownView } from "../../components/MarkdownView";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import {
  type ContactDetail,
  useAddEmployment,
  useArchiveContact,
  useContact,
  useDeleteEmployment,
  useUpdateContact,
} from "./api";
import { CompanySelect, TagBadges } from "./components";
import { ContactForm } from "./ContactForm";
import { toContactPayload } from "./payloads";
import { useNotify } from "./useNotify";

function Employments({ contact }: { contact: ContactDetail }) {
  const { t, i18n } = useTranslation("directory");
  const notify = useNotify();
  const add = useAddEmployment(contact.id);
  const remove = useDeleteEmployment(contact.id);
  const form = useForm({
    initialValues: {
      company_id: null as string | null,
      job_title: "",
      start_date: "",
      end_date: "",
    },
    validate: { company_id: (v) => (v ? null : t("validation.required")) },
  });
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value))
      : "…";

  return (
    <Card withBorder>
      <Title order={5} mb="sm">
        {t("contacts.history")}
      </Title>
      {contact.employments.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t("contacts.noHistory")}
        </Text>
      ) : (
        <Table>
          <Table.Tbody>
            {contact.employments.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/directory/companies/${e.company.id}`}>
                    {e.company.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{e.job_title}</Table.Td>
                <Table.Td>
                  {date(e.start_date)} → {date(e.end_date)}
                </Table.Td>
                <Table.Td w={40}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t("actions.deleteOf", { name: e.company.name })}
                    onClick={() => remove.mutate(e.id, { onError: notify.error })}
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
        onSubmit={form.onSubmit((values) =>
          add.mutate(
            {
              company_id: values.company_id!,
              job_title: values.job_title.trim() || null,
              start_date: values.start_date || null,
              end_date: values.end_date || null,
            },
            { onSuccess: () => form.reset(), onError: notify.error },
          ),
        )}
      >
        <Group align="flex-end" mt="md" wrap="wrap">
          <CompanySelect label={t("contacts.company")} {...form.getInputProps("company_id")} />
          <TextInput label={t("contacts.jobTitle")} {...form.getInputProps("job_title")} />
          <TextInput
            label={t("contacts.startDate")}
            type="date"
            {...form.getInputProps("start_date")}
          />
          <TextInput
            label={t("contacts.endDate")}
            type="date"
            {...form.getInputProps("end_date")}
          />
          <Button type="submit" variant="light" loading={add.isPending}>
            {t("contacts.addPosition")}
          </Button>
        </Group>
      </form>
    </Card>
  );
}

export function ContactPage() {
  const { t } = useTranslation("directory");
  const errorMessage = useErrorMessage();
  const notify = useNotify();
  const { contactId = "" } = useParams();
  const contact = useContact(contactId);
  const update = useUpdateContact(contactId);
  const archive = useArchiveContact(contactId);

  if (contact.isPending) return <Loader size="sm" />;
  if (contact.isError) return <Alert color="red">{errorMessage(contact.error)}</Alert>;
  const data = contact.data;
  const fullName = `${data.first_name} ${data.last_name}`;

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/directory/contacts">
          {t("sections.contacts")}
        </Anchor>
        <Text>{fullName}</Text>
      </Breadcrumbs>
      <Group justify="space-between">
        <div>
          <Group gap="sm">
            <Title order={3}>{fullName}</Title>
            {data.archived_at && <Badge color="gray">{t("common.archived")}</Badge>}
            <TagBadges tags={data.tags} />
          </Group>
          <Text c="dimmed" size="sm">
            {[data.job_title, data.org_unit?.name].filter(Boolean).join(" · ")}
            {data.company && (
              <>
                {data.job_title || data.org_unit ? " · " : ""}
                <Anchor component={Link} to={`/directory/companies/${data.company.id}`} size="sm">
                  {data.company.name}
                </Anchor>
              </>
            )}
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={data.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
          loading={archive.isPending}
          onClick={() => archive.mutate(!data.archived_at)}
        >
          {t(data.archived_at ? "actions.restore" : "actions.archive")}
        </Button>
      </Group>
      <Group align="flex-start" grow wrap="wrap">
        <ContactForm
          key={`${data.id}-${data.company?.id ?? ""}`}
          contact={data}
          submitting={update.isPending}
          onSubmit={(values) =>
            update.mutate(toContactPayload(values), {
              onSuccess: notify.saved,
              onError: notify.error,
            })
          }
        />
        <Stack miw={280}>
          <Text fw={500} size="sm">
            {t("common.notesPreview")}
          </Text>
          <MarkdownView source={data.notes} empty={t("common.noNotes")} />
        </Stack>
      </Group>
      <Employments contact={data} />
    </Stack>
  );
}
