import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  opened: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: ReactNode;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  opened,
  title,
  message,
  confirmLabel,
  danger = true,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onCancel} title={title} centered>
      <Text size="sm">{message}</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button color={danger ? "red" : undefined} loading={loading} onClick={onConfirm}>
          {confirmLabel ?? t("common.confirm")}
        </Button>
      </Group>
    </Modal>
  );
}
