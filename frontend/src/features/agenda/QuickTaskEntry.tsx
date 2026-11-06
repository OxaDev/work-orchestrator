import { Button, Kbd } from "@mantine/core";
import { useHotkeys, useWindowEvent } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { todayIso } from "./calendar";
import { TaskModal } from "./TaskModal";

/** Dispatched on `window` to open the quick entry from elsewhere (the `Ctrl+K` palette). */
export const NEW_TASK_EVENT = "wo:new-task";

/**
 * Quick task entry from anywhere (P5-13): press `n` (ignored while typing in a field) or use
 * the header button. Defaults to today, morning before 1 pm.
 */
export function QuickTaskEntry() {
  const { t } = useTranslation("agenda");
  const [opened, setOpened] = useState(false);
  useHotkeys([["n", () => setOpened(true)]]);
  useWindowEvent(NEW_TASK_EVENT, () => setOpened(true));
  return (
    <>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconPlus size={14} />}
        rightSection={<Kbd size="xs">n</Kbd>}
        onClick={() => setOpened(true)}
        visibleFrom="sm"
      >
        {t("task.quick")}
      </Button>
      {opened && (
        <TaskModal
          defaults={{ date: todayIso(), period: new Date().getHours() < 13 ? "AM" : "PM" }}
          onClose={() => setOpened(false)}
        />
      )}
    </>
  );
}
