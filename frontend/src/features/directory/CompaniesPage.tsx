import { Badge, Button, Group, Modal, Select, Stack, Switch, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { COMPANY_TYPES, type CompanyType, useCompanies, useCreateCompany, useSectors } from "./api";
import { CompanyForm } from "./CompanyForm";
import { toCompanyPayload } from "./payloads";
import { TagBadges } from "./components";
import { useNotify } from "./useNotify";

const PAGE_SIZE = 50;

export function CompaniesPage() {
  const { t, i18n } = useTranslation("directory");
  const navigate = useNavigate();
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const [type, setType] = useState<CompanyType | null>(null);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const create = useCreateCompany();
  const sectors = useSectors();
  const sectorName = (id: string | null) => {
    const sector = sectors.data?.find((s) => s.id === id);
    return sector ? (i18n.language === "en" ? sector.name_en : sector.name_fr) : "";
  };
  const companies = useCompanies({
    q: debounced || undefined,
    type: type ?? undefined,
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
            placeholder={t("companies.searchPlaceholder")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select
            aria-label={t("companies.types")}
            placeholder={t("companies.allTypes")}
            clearable
            data={COMPANY_TYPES.map((v) => ({ value: v, label: t(`companyTypes.${v}`) }))}
            value={type}
            onChange={(v) => {
              setType(v as CompanyType | null);
              setPage(1);
            }}
          />
          <Switch
            label={t("common.showArchived")}
            checked={archived}
            onChange={(e) => setArchived(e.currentTarget.checked)}
          />
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          {t("companies.create")}
        </Button>
      </Group>
      <EntityTable
        loading={companies.isPending}
        rows={companies.data?.items}
        total={companies.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        emptyText={t("companies.empty")}
        onRowClick={(company) => void navigate(`/directory/companies/${company.id}`)}
        rowLabel={(company) => company.name}
        columns={[
          {
            key: "name",
            header: t("companies.name"),
            render: (c) => (
              <Group gap="xs">
                <span>{c.name}</span>
                {c.archived_at && (
                  <Badge size="xs" color="gray">
                    {t("common.archived")}
                  </Badge>
                )}
              </Group>
            ),
          },
          {
            key: "types",
            header: t("companies.types"),
            render: (c) => c.types.map((v) => t(`companyTypes.${v}`)).join(", "),
          },
          {
            key: "sector",
            header: t("companies.primarySector"),
            render: (c) => sectorName(c.primary_sector_id),
          },
          { key: "contacts", header: t("sections.contacts"), render: (c) => c.contact_count },
          { key: "tags", header: t("tags.label"), render: (c) => <TagBadges tags={c.tags} /> },
        ]}
      />
      <Modal
        opened={creating}
        onClose={() => setCreating(false)}
        title={t("companies.create")}
        size="lg"
      >
        <CompanyForm
          submitting={create.isPending}
          onSubmit={(values) =>
            create.mutate(toCompanyPayload(values), {
              onSuccess: (company) => {
                setCreating(false);
                void navigate(`/directory/companies/${company.id}`);
              },
              onError: notify.error,
            })
          }
        />
      </Modal>
    </Stack>
  );
}
