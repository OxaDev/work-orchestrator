import { Anchor, Select, Stack, Text } from "@mantine/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useMissionChoices, useProjects } from "./api";
import { useWorkContext } from "./scope";

/** Navbar block: pick the mission, then the project, the app is scoped to (ADR-0042). */
export function ContextSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation("projects");
  const { missionId, projectId, setScope } = useWorkContext();
  const missions = useMissionChoices();
  const projects = useProjects({ mission_id: missionId ?? undefined }, Boolean(missionId), true);
  const missionItems = missions.data?.items ?? [];
  const projectItems = projects.data?.items ?? [];

  // A remembered mission or project that no longer exists (deleted, archived) is forgotten.
  useEffect(() => {
    const knownMissions = missions.data?.items;
    const knownProjects = projects.data?.items;
    if (knownMissions && missionId && !knownMissions.some((m) => m.id === missionId)) {
      setScope({ missionId: null, projectId: null });
    } else if (knownProjects && projectId && !knownProjects.some((p) => p.id === projectId)) {
      setScope({ missionId, projectId: null });
    }
  }, [missions.data, projects.data, missionId, projectId, setScope]);

  return (
    <Stack gap={6} mb="sm" p={4} aria-labelledby="work-context-title">
      <Text id="work-context-title" size="xs" fw={600} c="dimmed" tt="uppercase">
        {t("context.title")}
      </Text>
      <Select
        size="xs"
        label={t("context.mission")}
        placeholder={t("context.allMissions")}
        clearable
        searchable
        value={missionId}
        data={missionItems.map((m) => ({ value: m.id, label: m.title }))}
        onChange={(value) => setScope({ missionId: value, projectId: null })}
      />
      <Select
        size="xs"
        label={t("context.project")}
        placeholder={missionId ? t("context.allProjects") : t("context.pickMission")}
        clearable
        searchable
        disabled={!missionId}
        value={projectId}
        data={projectItems.map((p) => ({ value: p.id, label: p.name }))}
        onChange={(value) => setScope({ missionId, projectId: value })}
      />
      {missionId && projectId && (
        <Anchor
          component={Link}
          size="xs"
          to={`/missions/${missionId}/projects/${projectId}`}
          onClick={onNavigate}
        >
          {t("context.open")}
        </Anchor>
      )}
      {missionId && !projectId && projects.data && projectItems.length === 0 && (
        <Anchor
          component={Link}
          size="xs"
          to={`/missions/${missionId}?tab=projects`}
          onClick={onNavigate}
        >
          {t("context.createFirst")}
        </Anchor>
      )}
    </Stack>
  );
}
