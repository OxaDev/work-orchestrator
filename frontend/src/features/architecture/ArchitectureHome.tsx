import {
  Anchor,
  Badge,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { CompanySelect } from "../directory/components";
import { projectPath, useProject } from "../projects/api";
import { useWorkContext } from "../projects/scope";
import { useArchitectures, useDomains } from "./api";
import { ArchitectureModal } from "./ArchitectureModal";
import { DomainForm } from "./DomainForm";
import { DomainTree } from "./DomainTree";
import { LIFECYCLE_COLORS } from "./kinds";

/** /architecture — architectures and domain trees by client (P8-8); the current project's
 * architectures by default (ADR-0042). */
export function ArchitectureHome() {
  const { t } = useTranslation("architecture");
  const [params, setParams] = useSearchParams();
  const { projectId } = useWorkContext();
  const project = useProject(projectId);
  const [allChosen, setAll] = useState(false);
  const byProject = Boolean(projectId) && !allChosen;
  const tab = params.get("tab") === "domains" ? "domains" : "architectures";
  const company = params.get("company") ?? (byProject ? (project.data?.client.id ?? null) : null);
  const setCompany = (value: string | null) =>
    setParams(value ? { tab, company: value } : { tab }, { replace: true });
  const architectures = useArchitectures(
    byProject && projectId ? { project_id: projectId } : company ? { company_id: company } : {},
  );
  const domains = useDomains({ company_id: company ?? undefined }, Boolean(company));
  const [creating, setCreating] = useState<"architecture" | "domain" | null>(null);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("title")}</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          disabled={tab === "domains" && !company}
          onClick={() => setCreating(tab === "domains" ? "domain" : "architecture")}
        >
          {tab === "domains" ? t("domains.create") : t("architectures.create")}
        </Button>
      </Group>
      <Group align="flex-end">
        {projectId && (
          <SegmentedControl
            size="xs"
            aria-label={t("scope.label")}
            value={byProject ? "project" : "all"}
            onChange={(value) => setAll(value === "all")}
            data={[
              { value: "project", label: t("scope.project") },
              { value: "all", label: t("scope.all") },
            ]}
          />
        )}
        {byProject && project.data ? (
          <Anchor component={Link} to={projectPath(project.data, "architectures")} size="sm">
            {project.data.mission.name} › {project.data.name}
          </Anchor>
        ) : (
          <CompanySelect
            label={t("fields.client")}
            placeholder={t("allClients")}
            value={company}
            onChange={setCompany}
            maw={360}
          />
        )}
      </Group>
      <Tabs
        value={tab}
        onChange={(value) =>
          setParams({ tab: value ?? "architectures", ...(company ? { company } : {}) })
        }
      >
        <Tabs.List>
          <Tabs.Tab value="architectures">{t("tabs.architectures")}</Tabs.Tab>
          <Tabs.Tab value="domains">{t("tabs.domains")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="architectures" pt="md">
          <EntityTable
            loading={architectures.isPending}
            rows={architectures.data}
            emptyText={t("architectures.empty")}
            emptyAction={
              <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                onClick={() => setCreating("architecture")}
              >
                {t("architectures.create")}
              </Button>
            }
            columns={[
              {
                key: "name",
                header: t("fields.name"),
                render: (a) => (
                  <Anchor component={Link} to={`/architecture/architectures/${a.id}`} size="sm">
                    {a.name}
                  </Anchor>
                ),
              },
              { key: "client", header: t("fields.client"), render: (a) => a.company.name },
              {
                key: "projects",
                header: t("fields.projects"),
                render: (a) =>
                  a.projects.map((p) => `${p.mission.name} › ${p.name}`).join(", ") || "—",
              },
              {
                key: "members",
                header: t("architectures.members"),
                render: (a) => a.member_count,
              },
              {
                key: "lifecycle",
                header: t("fields.lifecycle"),
                render: (a) => (
                  <Badge size="sm" variant="light" color={LIFECYCLE_COLORS[a.lifecycle]}>
                    {t(`lifecycles.${a.lifecycle}`)}
                  </Badge>
                ),
              },
            ]}
          />
        </Tabs.Panel>
        <Tabs.Panel value="domains" pt="md">
          {company ? (
            <DomainTree domains={domains.data ?? []} label={t("domains.tree")} />
          ) : (
            <Text size="sm" c="dimmed">
              {t("domains.pickClient")}
            </Text>
          )}
        </Tabs.Panel>
      </Tabs>
      {creating === "architecture" && (
        <ArchitectureModal
          companyId={company}
          projectId={byProject ? (projectId ?? undefined) : undefined}
          onClose={() => setCreating(null)}
        />
      )}
      {creating === "domain" && company && (
        <DomainForm companyId={company} onClose={() => setCreating(null)} />
      )}
    </Stack>
  );
}
