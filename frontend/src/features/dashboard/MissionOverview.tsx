import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Rating,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { MermaidDiagram } from "../../components/MermaidDiagram";
import { formatDuration } from "../agenda/duration";
import { dayPath } from "../agenda/micro";
import type { Task } from "../agenda/tasksApi";
import { useMermaid } from "../architecture/api";
import { useNotify } from "../directory/useNotify";
import { usePutMissionTechnology } from "../missions/api";
import { dashboardKeys, type MissionOverview as Overview, useMissionOverview } from "./api";

const MAX_BARS = 6;

/** One headline number (dataviz: a stat tile, not a one-bar chart). */
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fz={26} fw={700} lh={1.2}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  );
}

/**
 * Ranked horizontal bars, one hue, largest first, values written beside each bar; the tail
 * beyond six subjects folds into "Others" (dataviz: part-to-whole, comparing the parts).
 */
function TimeBySubject({ rows, total }: { rows: Overview["time"]["by_subject"]; total: number }) {
  const { t } = useTranslation("dashboard");
  if (!rows.length) {
    return (
      <Text size="sm" c="dimmed">
        {t("time.noTask")}
      </Text>
    );
  }
  const shown = rows.slice(0, MAX_BARS);
  const rest = rows.slice(MAX_BARS);
  const bars = rest.length
    ? [
        ...shown,
        {
          subject: { id: "others", name: t("time.others", { count: rest.length }) },
          minutes: rest.reduce((sum, r) => sum + r.minutes, 0),
          task_count: rest.reduce((sum, r) => sum + r.task_count, 0),
        },
      ]
    : shown;
  const max = Math.max(...bars.map((b) => b.minutes));
  return (
    <Stack gap={6} role="list" aria-label={t("time.bySubject")}>
      {bars.map((bar) => {
        const share = Math.round((100 * bar.minutes) / total);
        return (
          <Tooltip
            key={bar.subject.id}
            label={t("time.tooltip", {
              duration: formatDuration(bar.minutes),
              count: bar.task_count,
              share,
            })}
          >
            <Box
              role="listitem"
              aria-label={`${bar.subject.name} : ${formatDuration(bar.minutes)}, ${share} %`}
            >
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm" truncate>
                  {bar.subject.name}
                </Text>
                <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {formatDuration(bar.minutes)} · {share} %
                </Text>
              </Group>
              <Box
                h={8}
                mt={2}
                w={`${(100 * bar.minutes) / max}%`}
                style={{ background: "var(--mantine-color-blue-6)", borderRadius: "0 4px 4px 0" }}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

function Technologies({ mission, rows }: { mission: string; rows: Overview["technologies"] }) {
  const { t } = useTranslation("dashboard");
  const notify = useNotify();
  const queryClient = useQueryClient();
  const put = usePutMissionTechnology(mission);
  const save = (technologyId: string, weight: number, version: string | null) =>
    put.mutate(
      { technologyId, weight, version },
      {
        onSuccess: () =>
          void queryClient.invalidateQueries({ queryKey: dashboardKeys.overview(mission) }),
        onError: notify.error,
      },
    );
  if (!rows.length) {
    return (
      <Text size="sm" c="dimmed">
        {t("technologies.empty")}
      </Text>
    );
  }
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("technologies.name")}</Table.Th>
          <Table.Th>{t("technologies.weight")}</Table.Th>
          <Table.Th>{t("technologies.suggestion")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.technology.id}>
            <Table.Td>
              {row.technology.name}
              {row.version && ` ${row.version}`}
            </Table.Td>
            <Table.Td>
              <Rating
                size="xs"
                count={5}
                value={row.weight ?? 0}
                aria-label={t("technologies.weightOf", { name: row.technology.name })}
                onChange={(value) => save(row.technology.id, value, row.version)}
              />
            </Table.Td>
            <Table.Td>
              {row.suggested_weight !== null && (
                <Group gap={6} wrap="nowrap">
                  <Tooltip
                    label={t("technologies.minutes", { duration: formatDuration(row.minutes) })}
                  >
                    <Badge
                      variant="light"
                      color={row.suggested_weight === row.weight ? "gray" : "blue"}
                    >
                      {t("technologies.suggested", { weight: row.suggested_weight })}
                    </Badge>
                  </Tooltip>
                  {row.suggested_weight !== row.weight && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      aria-label={t("technologies.applyOf", { name: row.technology.name })}
                      onClick={() => save(row.technology.id, row.suggested_weight!, row.version)}
                    >
                      {t("technologies.apply")}
                    </Button>
                  )}
                </Group>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (!tasks.length) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {tasks.map((task) => (
        <Group key={task.id} gap="xs" wrap="nowrap">
          <Anchor component={Link} to={dayPath(task.date)} size="sm" w={60}>
            {format.format(new Date(`${task.date}T00:00:00Z`))}
          </Anchor>
          <Text size="sm" truncate style={{ flex: 1 }}>
            {task.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {task.subject.title}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/** Small diagram of the first architecture: its top two levels (P10-3). */
function MiniArchitecture({ id }: { id: string }) {
  const { i18n } = useTranslation();
  const mermaid = useMermaid(id, {
    format: "flowchart",
    direction: "LR",
    view: "CURRENT",
    depth: 1,
    lang: i18n.language === "en" ? "en" : "fr",
  });
  return mermaid.data ? <MermaidDiagram code={mermaid.data.code} /> : <Loader size="xs" />;
}

/** The mission page's first tab: where time went, on what, with whom (P10-3, Q-K1). */
export function MissionOverview({ missionId }: { missionId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const overview = useMissionOverview(missionId);
  if (!overview.data) return <Loader size="sm" />;
  const { time, technologies, contacts_by_role: groups, architectures } = overview.data;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const days = (value: number) => t("days", { count: value, value: number.format(value) });

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <StatTile label={t("kpi.done")} value={days(time.days_done)} />
        <StatTile label={t("kpi.planned")} value={days(time.days_planned)} />
        <StatTile
          label={t("kpi.remaining")}
          value={time.days_remaining === null ? "—" : days(time.days_remaining)}
          hint={time.days_remaining === null ? t("kpi.noEnd") : undefined}
        />
        <StatTile label={t("kpi.tasks")} value={formatDuration(time.done_minutes)} />
      </SimpleGrid>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("time.bySubject")}
            </Title>
            <TimeBySubject rows={time.by_subject} total={time.done_minutes} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("technologies.title")}
            </Title>
            <Technologies mission={missionId} rows={technologies} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("tasks.recent")}
            </Title>
            <TaskList tasks={overview.data.recent_tasks} empty={t("tasks.none")} />
            <Title order={5} my="sm">
              {t("tasks.planned")}
            </Title>
            <TaskList tasks={overview.data.planned_tasks} empty={t("tasks.none")} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("contacts.title")}
            </Title>
            {groups.length === 0 && (
              <Text size="sm" c="dimmed">
                {t("contacts.empty")}
              </Text>
            )}
            <Stack gap="xs">
              {groups.map((group) => (
                <div key={group.role?.id ?? "none"}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    {group.role
                      ? i18n.language === "en"
                        ? group.role.name_en
                        : group.role.name_fr
                      : t("contacts.noRole")}
                  </Text>
                  {group.contacts.map((c) => (
                    <Text key={c.contact.id} size="sm">
                      <Anchor component={Link} to={`/directory/contacts/${c.contact.id}`}>
                        {c.contact.name}
                      </Anchor>
                      {c.job_title && ` — ${c.job_title}`}
                    </Text>
                  ))}
                </div>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("architectures.title")}
            </Title>
            {architectures.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t("architectures.empty")}
              </Text>
            ) : (
              <Stack gap="xs">
                {architectures.map((a) => (
                  <Group key={a.id} gap="xs">
                    <Anchor component={Link} to={`/architecture/architectures/${a.id}`} size="sm">
                      {a.name}
                    </Anchor>
                    <Anchor
                      component={Link}
                      to={`/architecture/architectures/${a.id}/graph`}
                      size="xs"
                    >
                      {t("architectures.graph")}
                    </Anchor>
                  </Group>
                ))}
                <MiniArchitecture id={architectures[0]!.id} />
              </Stack>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Title order={5} mb="sm">
              {t("documents.title")}
            </Title>
            <Stack gap={4}>
              {[...overview.data.documents, ...overview.data.backlinks.map((b) => b.document)]
                .filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i)
                .map((d) => (
                  <Anchor key={d.id} component={Link} to={`/documents/${d.id}`} size="sm">
                    {d.title}
                  </Anchor>
                ))}
              {overview.data.documents.length + overview.data.backlinks.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t("documents.empty")}
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
