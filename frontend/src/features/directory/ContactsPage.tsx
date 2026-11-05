import { Badge, Button, Group, Modal, Stack, Switch, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { useContacts, useCreateContact } from "./api";
import { CompanySelect, TagBadges } from "./components";
import { ContactForm } from "./ContactForm";
import { toContactPayload } from "./payloads";
import { useNotify } from "./useNotify";

const PAGE_SIZE = 50;

export function ContactsPage() {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const create = useCreateContact();
  const creating = params.get("new") === "1";
  const closeCreate = () => setParams({}, { replace: true });
  const contacts = useContacts({
    q: debounced || undefined,
    company_id: companyId ?? undefined,
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
            placeholder={t("contacts.searchPlaceholder")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
          <CompanySelect
            aria-label={t("contacts.company")}
            placeholder={t("contacts.allCompanies")}
            value={companyId}
            onChange={(v) => {
              setCompanyId(v);
              setPage(1);
            }}
          />
          <Switch
            label={t("common.showArchived")}
            checked={archived}
            onChange={(e) => setArchived(e.currentTarget.checked)}
          />
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setParams({ new: "1" })}>
          {t("contacts.create")}
        </Button>
      </Group>
      <EntityTable
        loading={contacts.isPending}
        rows={contacts.data?.items}
        total={contacts.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        emptyText={t("contacts.empty")}
        onRowClick={(c) => void navigate(`/directory/contacts/${c.id}`)}
        rowLabel={(c) => `${c.first_name} ${c.last_name}`}
        columns={[
          {
            key: "name",
            header: t("contacts.name"),
            render: (c) => (
              <Group gap="xs">
                <span>
                  {c.first_name} {c.last_name}
                </span>
                {c.archived_at && (
                  <Badge size="xs" color="gray">
                    {t("common.archived")}
                  </Badge>
                )}
              </Group>
            ),
          },
          { key: "title", header: t("contacts.jobTitle"), render: (c) => c.job_title },
          { key: "company", header: t("contacts.company"), render: (c) => c.company?.name },
          { key: "email", header: t("contacts.emailWork"), render: (c) => c.email_work },
          { key: "tags", header: t("tags.label"), render: (c) => <TagBadges tags={c.tags} /> },
        ]}
      />
      <Modal opened={creating} onClose={closeCreate} title={t("contacts.create")} size="lg">
        <ContactForm
          defaultCompanyId={params.get("company")}
          submitting={create.isPending}
          onSubmit={(values) =>
            create.mutate(toContactPayload(values), {
              onSuccess: (contact) =>
                void navigate(`/directory/contacts/${contact.id}`, { replace: true }),
              onError: notify.error,
            })
          }
        />
      </Modal>
    </Stack>
  );
}
