import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { MarkdownView } from "../../components/MarkdownView";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { type Company, useArchiveCompany, useCompany, useContacts, useUpdateCompany } from "./api";
import { CompanyForm } from "./CompanyForm";
import { toCompanyPayload } from "./payloads";
import { TagBadges } from "./components";
import { CompanyMissions } from "../missions/CompanyMissions";
import { OrgChartEditor } from "./OrgChartEditor";
import { useNotify } from "./useNotify";

function CompanyContacts({ companyId }: { companyId: string }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const contacts = useContacts({ company_id: companyId, limit: 200 });
  return (
    <Stack>
      <Group justify="flex-end">
        <Button
          component={Link}
          to={`/directory/contacts?new=1&company=${companyId}`}
          variant="light"
        >
          {t("contacts.create")}
        </Button>
      </Group>
      <EntityTable
        loading={contacts.isPending}
        rows={contacts.data?.items}
        emptyText={t("contacts.empty")}
        onRowClick={(c) => void navigate(`/directory/contacts/${c.id}`)}
        rowLabel={(c) => `${c.first_name} ${c.last_name}`}
        columns={[
          {
            key: "name",
            header: t("contacts.name"),
            render: (c) => `${c.first_name} ${c.last_name}`,
          },
          { key: "title", header: t("contacts.jobTitle"), render: (c) => c.job_title },
          { key: "unit", header: t("contacts.orgUnit"), render: (c) => c.org_unit?.name },
        ]}
      />
    </Stack>
  );
}

function CompanyInfo({ company }: { company: Company }) {
  const { t } = useTranslation("directory");
  const notify = useNotify();
  const update = useUpdateCompany(company.id);
  return (
    <Group align="flex-start" grow wrap="wrap">
      <CompanyForm
        key={company.id}
        company={company}
        submitting={update.isPending}
        onSubmit={(values) =>
          update.mutate(toCompanyPayload(values), {
            onSuccess: notify.saved,
            onError: notify.error,
          })
        }
      />
      <Stack miw={280}>
        <Text fw={500} size="sm">
          {t("common.notesPreview")}
        </Text>
        <MarkdownView source={company.notes} empty={t("common.noNotes")} />
      </Stack>
    </Group>
  );
}

export function CompanyPage() {
  const { t } = useTranslation("directory");
  const errorMessage = useErrorMessage();
  const { companyId = "" } = useParams();
  const company = useCompany(companyId);
  const archive = useArchiveCompany(companyId);

  if (company.isPending) return <Loader size="sm" />;
  if (company.isError) return <Alert color="red">{errorMessage(company.error)}</Alert>;
  const data = company.data;

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/directory/companies">
          {t("sections.companies")}
        </Anchor>
        <Text>{data.name}</Text>
      </Breadcrumbs>
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={3}>{data.name}</Title>
          {data.types.map((type) => (
            <Badge key={type} variant="light">
              {t(`companyTypes.${type}`)}
            </Badge>
          ))}
          {data.archived_at && <Badge color="gray">{t("common.archived")}</Badge>}
          <TagBadges tags={data.tags} />
        </Group>
        <Group gap="xs">
          {data.website && (
            <Button
              component="a"
              href={data.website}
              target="_blank"
              rel="noreferrer"
              variant="subtle"
              leftSection={<IconExternalLink size={16} />}
            >
              {t("common.website")}
            </Button>
          )}
          <Button
            variant="default"
            leftSection={
              data.archived_at ? <IconArchiveOff size={16} /> : <IconArchive size={16} />
            }
            loading={archive.isPending}
            onClick={() => archive.mutate(!data.archived_at)}
          >
            {t(data.archived_at ? "actions.restore" : "actions.archive")}
          </Button>
        </Group>
      </Group>
      {data.parent_company && (
        <Text size="sm">
          {t("companies.parent")} :{" "}
          <Anchor component={Link} to={`/directory/companies/${data.parent_company.id}`}>
            {data.parent_company.name}
          </Anchor>
        </Text>
      )}
      <Tabs defaultValue="info" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="info">{t("companies.tabs.info")}</Tabs.Tab>
          <Tabs.Tab value="org">{t("companies.tabs.org")}</Tabs.Tab>
          <Tabs.Tab value="contacts">
            {t("companies.tabs.contacts")} ({data.contact_count})
          </Tabs.Tab>
          <Tabs.Tab value="missions">{t("companies.tabs.missions")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="info" pt="md">
          <CompanyInfo company={data} />
        </Tabs.Panel>
        <Tabs.Panel value="org" pt="md">
          <OrgChartEditor companyId={data.id} />
        </Tabs.Panel>
        <Tabs.Panel value="contacts" pt="md">
          <CompanyContacts companyId={data.id} />
        </Tabs.Panel>
        <Tabs.Panel value="missions" pt="md">
          <CompanyMissions companyId={data.id} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
