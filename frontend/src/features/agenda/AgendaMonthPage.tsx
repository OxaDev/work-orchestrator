import { ActionIcon, Alert, Anchor, Button, Grid, Group, Stack, Title } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconLock } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";

import { NotFoundPage } from "../placeholder/NotFoundPage";
import { useHalfDays, useHolidayGeneration, useMonthStatus, usePublicHolidays } from "./api";
import { AssignPanel } from "./AssignPanel";
import { iso, monthRange, parseYearMonth, todayIso } from "./calendar";
import { MonthGrid } from "./MonthGrid";
import { MonthLockPanel } from "./MonthLockPanel";
import { useMissionIndex } from "./useLabels";
import { useSelection } from "./useSelection";

/** /agenda -> current month. */
export function AgendaIndex() {
  const today = todayIso();
  return <Navigate to={`/agenda/${today.slice(0, 4)}/${Number(today.slice(5, 7))}`} replace />;
}

function MonthView({ year, month }: { year: number; month: number }) {
  const { t, i18n } = useTranslation("agenda");
  const { from, to } = monthRange(year, month);
  const { ready } = useHolidayGeneration(year);
  const halfDays = useHalfDays(from, to, ready);
  const holidays = usePublicHolidays(year);
  const status = useMonthStatus(year, month, ready);
  const missions = useMissionIndex();
  const selection = useSelection();
  const locked = status.data?.locked ?? false;

  const halfDayMap = useMemo(
    () => new Map((halfDays.data ?? []).map((h) => [`${h.date}|${h.period}`, h])),
    [halfDays.data],
  );
  const holidayMap = useMemo(
    () => new Map((holidays.data ?? []).map((h) => [h.date, h.name])),
    [holidays.data],
  );
  const previous = month === 1 ? [year - 1, 12] : [year, month - 1];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  const title = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso(year, month, 1)}T00:00:00Z`));

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            component={Link}
            to={`/agenda/${previous[0]}/${previous[1]}`}
            aria-label={t("previousMonth")}
            onClick={selection.clear}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Title order={2} style={{ textTransform: "capitalize" }}>
            {title}
          </Title>
          <ActionIcon
            variant="default"
            component={Link}
            to={`/agenda/${next[0]}/${next[1]}`}
            aria-label={t("nextMonth")}
            onClick={selection.clear}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
        <Group gap="xs">
          <Button component={Link} to="/agenda" variant="default" size="xs">
            {t("today")}
          </Button>
          <Anchor component={Link} to={`/agenda/${year}`} size="sm">
            {t("yearView", { year })}
          </Anchor>
        </Group>
      </Group>
      {locked && (
        <Alert color="teal" icon={<IconLock size={18} />}>
          {t("lock.lockedNotice")}
        </Alert>
      )}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <MonthGrid
            year={year}
            month={month}
            halfDays={halfDayMap}
            holidays={holidayMap}
            missions={missions}
            selection={selection}
            locked={locked}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack>
            {!locked && (
              <AssignPanel selection={selection} halfDays={halfDayMap} missions={missions} />
            )}
            {status.data && <MonthLockPanel status={status.data} missions={missions} />}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export function AgendaMonthPage() {
  const params = useParams();
  const parsed = parseYearMonth(params.year, params.month);
  if (!parsed) return <NotFoundPage />;
  // Keyed: navigating to another month resets the selection.
  return (
    <MonthView key={`${parsed.year}-${parsed.month}`} year={parsed.year} month={parsed.month} />
  );
}
