import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useNotify } from "../directory/useNotify";
import { type MonthStatus, useLockMonth, useUnlockMonth } from "./api";
import { Legend } from "./Legend";
import { useHalfDayLabels, type MissionInfo } from "./useLabels";

/** Month recap and timesheet-like validation (ADR-0021, P4-15, P4-16). */
export function MonthLockPanel({
  status,
  missions,
}: {
  status: MonthStatus;
  missions: Map<string, MissionInfo>;
}) {
  const { t, i18n } = useTranslation("agenda");
  const notify = useNotify();
  const labels = useHalfDayLabels(missions);
  const lock = useLockMonth(status.year, status.month);
  const unlock = useUnlockMonth(status.year, status.month);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const dateTime = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const { stats } = status;

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>{t("recap.title")}</Title>
          {status.locked ? (
            <Badge color="teal" leftSection={<IconLock size={12} />}>
              {t("lock.locked")}
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              {t("lock.open")}
            </Badge>
          )}
        </Group>
        <Text size="sm">
          {t("recap.filled", { filled: stats.filled_days, working: stats.working_days })}
        </Text>
        {stats.unfilled_count > 0 && (
          <Text size="sm" c="orange">
            {t("recap.unfilled", { count: stats.unfilled_count })}
          </Text>
        )}
        <Legend stats={stats} />
        {status.locked ? (
          <>
            {status.locked_at && (
              <Text size="xs" c="dimmed">
                {t("lock.lockedAt", { date: dateTime.format(new Date(status.locked_at)) })}
                {status.note && ` · ${status.note}`}
              </Text>
            )}
            <Button
              variant="default"
              leftSection={<IconLockOpen size={16} />}
              onClick={() => setUnlocking(true)}
            >
              {t("lock.unlock")}
            </Button>
          </>
        ) : (
          <Button leftSection={<IconLock size={16} />} onClick={() => setLocking(true)}>
            {t("lock.validate")}
          </Button>
        )}
        {status.events.length > 0 && (
          <Stack gap={2}>
            <Text size="xs" fw={500}>
              {t("lock.history")}
            </Text>
            {status.events.map((event) => (
              <Text key={event.at} size="xs" c="dimmed">
                {dateTime.format(new Date(event.at))} · {t(`lock.actions.${event.action}`)}
                {event.reason && ` · ${event.reason}`}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal opened={locking} onClose={() => setLocking(false)} title={t("lock.validateTitle")}>
        <Stack>
          {status.missing.length > 0 ? (
            <Alert color="orange" title={t("lock.incomplete", { count: status.missing.length })}>
              <List size="sm">
                {status.missing.slice(0, 6).map((slot) => (
                  <List.Item key={`${slot.date}${slot.period}`}>
                    {labels.day(slot.date)}, {labels.period(slot.period)}
                  </List.Item>
                ))}
              </List>
            </Alert>
          ) : (
            <Text size="sm">{t("lock.explain")}</Text>
          )}
          <Textarea
            label={t("lock.note")}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Button
            disabled={status.missing.length > 0}
            loading={lock.isPending}
            onClick={() =>
              lock.mutate(note.trim() || null, {
                onSuccess: () => setLocking(false),
                onError: notify.error,
              })
            }
          >
            {t("lock.confirm")}
          </Button>
        </Stack>
      </Modal>

      <Modal opened={unlocking} onClose={() => setUnlocking(false)} title={t("lock.unlockTitle")}>
        <Stack>
          <Textarea
            label={t("lock.reason")}
            description={t("lock.reasonHelp")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          <Button
            disabled={reason.trim().length < 3}
            loading={unlock.isPending}
            onClick={() =>
              unlock.mutate(reason.trim(), {
                onSuccess: () => {
                  setUnlocking(false);
                  setReason("");
                },
                onError: notify.error,
              })
            }
          >
            {t("lock.unlock")}
          </Button>
        </Stack>
      </Modal>
    </Card>
  );
}
