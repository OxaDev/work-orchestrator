import { Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { dayPath, weekStart } from "./micro";

type View = "month" | "week" | "day" | "standup" | "subjects" | "templates";

/** Links between macro and micro views around a reference date (P4-10, P5). */
export function AgendaViews({ date, current }: { date: string; current: View }) {
  const { t } = useTranslation("agenda");
  const links: { view: View; to: string }[] = [
    { view: "month", to: `/agenda/${date.slice(0, 4)}/${Number(date.slice(5, 7))}` },
    { view: "week", to: `/agenda/week/${weekStart(date)}` },
    { view: "day", to: dayPath(date) },
    { view: "standup", to: "/agenda/standup" },
    { view: "subjects", to: "/agenda/subjects" },
    { view: "templates", to: "/agenda/templates" },
  ];
  return (
    <Group gap={4} component="nav" aria-label={t("views.label")}>
      {links.map((link) => (
        <Button
          key={link.view}
          component={Link}
          to={link.to}
          size="compact-sm"
          variant={link.view === current ? "light" : "subtle"}
          aria-current={link.view === current ? "page" : undefined}
        >
          {t(`views.${link.view}`)}
        </Button>
      ))}
    </Group>
  );
}
