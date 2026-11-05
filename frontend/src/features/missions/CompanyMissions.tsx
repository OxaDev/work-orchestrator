import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { EntityTable } from "../../components/EntityTable";
import { useMissions } from "./api";
import { StatusBadge } from "./components";
import { formatDate } from "./format";

/** Missions held at a client, shown on the company page. */
export function CompanyMissions({ companyId }: { companyId: string }) {
  const { t, i18n } = useTranslation("missions");
  const navigate = useNavigate();
  const missions = useMissions({ client_id: companyId, include_archived: true, limit: 200 });
  return (
    <EntityTable
      loading={missions.isPending}
      rows={missions.data?.items}
      emptyText={t("empty")}
      onRowClick={(m) => void navigate(`/missions/${m.id}`)}
      rowLabel={(m) => m.title}
      columns={[
        { key: "title", header: t("fields.title"), render: (m) => m.title },
        { key: "job", header: t("fields.jobTitle"), render: (m) => m.job_title },
        {
          key: "start",
          header: t("fields.startDate"),
          render: (m) => formatDate(m.start_date, i18n.language),
        },
        {
          key: "status",
          header: t("fields.status"),
          render: (m) => <StatusBadge status={m.status} />,
        },
      ]}
    />
  );
}
