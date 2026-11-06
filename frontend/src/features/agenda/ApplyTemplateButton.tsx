import { Button } from "@mantine/core";
import { IconCalendarRepeat } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApplyTemplateModal } from "./ApplyTemplateModal";
import { useWeekTemplates } from "./templatesApi";
import { useMissionIndex } from "./useLabels";

/**
 * Opens the template wizard on a range. Proposes the template of a mission running in that
 * range, or of `missionId` (P6-5); `onlyLinked` hides the button when there is none.
 */
export function ApplyTemplateButton({
  start,
  end,
  missionId,
  onlyLinked = false,
}: {
  start: string;
  end: string;
  missionId?: string;
  onlyLinked?: boolean;
}) {
  const { t } = useTranslation("agenda");
  const templates = useWeekTemplates();
  const missions = useMissionIndex();
  const [opened, setOpened] = useState(false);
  // Several missions may run in the range: the template edited last is the likeliest.
  const proposed = (templates.data ?? [])
    .filter((tpl) => {
      if (!tpl.mission_id) return false;
      if (missionId) return tpl.mission_id === missionId;
      const mission = missions.get(tpl.mission_id);
      return mission && mission.start <= end && (!mission.end || mission.end >= start);
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (onlyLinked && !proposed) return null;
  return (
    <>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconCalendarRepeat size={14} />}
        onClick={() => setOpened(true)}
      >
        {proposed ? t("templates.applyNamed", { name: proposed.name }) : t("templates.applyButton")}
      </Button>
      {opened && (
        <ApplyTemplateModal
          defaults={{ templateId: proposed?.id ?? null, start, end }}
          onClose={() => setOpened(false)}
        />
      )}
    </>
  );
}
