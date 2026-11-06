import {
  Alert,
  Button,
  Card,
  Code,
  FileInput,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconDownload, IconFileZip, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useErrorMessage } from "../../i18n/useErrorMessage";
import { type ArchiveReport, downloadArchive, useImportArchive } from "../data/api";

/** Tables shown in the import summary, in this order; the others are summed up. */
const MAIN_TABLES = [
  "missions",
  "half_days",
  "tasks",
  "subjects",
  "documents",
  "domains",
  "contacts",
];

function ArchiveSummary({ report }: { report: ArchiveReport }) {
  const { t } = useTranslation("data");
  const rows = MAIN_TABLES.filter((name) => (report.tables[name] ?? 0) > 0);
  return (
    <Alert color="teal" title={t("archive.imported")}>
      <Table withRowBorders={false} verticalSpacing={2}>
        <Table.Tbody>
          {rows.map((name) => (
            <Table.Tr key={name}>
              <Table.Td>{t(`tables.${name}`)}</Table.Td>
              <Table.Td ta="right">{report.tables[name]}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td>{t("archive.files")}</Table.Td>
            <Table.Td ta="right">{report.attachments}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      {report.missing_files > 0 && (
        <Text size="sm" c="orange">
          {t("archive.missingFiles", { count: report.missing_files })}
        </Text>
      )}
    </Alert>
  );
}

/** Settings > Data: archive export and import (P11-4, P11-5), pointer to backups (P11-8). */
export function DataSettings() {
  const { t } = useTranslation("data");
  const errorMessage = useErrorMessage();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const importArchive = useImportArchive();

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadArchive();
    } catch (error) {
      setExportError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack maw={720}>
      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>{t("archive.exportTitle")}</Title>
          <Text size="sm">{t("archive.exportHelp")}</Text>
          {exportError && <Alert color="red">{exportError}</Alert>}
          <Group>
            <Button
              leftSection={<IconDownload size={16} />}
              loading={exporting}
              onClick={() => void runExport()}
            >
              {t("archive.export")}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>{t("archive.importTitle")}</Title>
          <Text size="sm">{t("archive.importHelp")}</Text>
          <FileInput
            label={t("archive.file")}
            placeholder={t("archive.choose")}
            accept=".zip,application/zip"
            leftSection={<IconFileZip size={16} />}
            value={file}
            onChange={(value) => {
              setFile(value);
              importArchive.reset();
            }}
            clearable
          />
          {importArchive.error && <Alert color="red">{errorMessage(importArchive.error)}</Alert>}
          {importArchive.data && <ArchiveSummary report={importArchive.data} />}
          <Group>
            <Button
              leftSection={<IconUpload size={16} />}
              disabled={!file}
              loading={importArchive.isPending}
              onClick={() => setConfirming(true)}
            >
              {t("archive.import")}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>{t("backups.title")}</Title>
          <Text size="sm">{t("backups.help")}</Text>
          <Code block>{"make backup\nmake restore BACKUP=backups/<YYYYMMDD-HHMMSS>"}</Code>
        </Stack>
      </Card>

      <ConfirmDialog
        opened={confirming}
        title={t("archive.confirmTitle")}
        message={t("archive.confirmMessage", { name: file?.name ?? "" })}
        confirmLabel={t("archive.import")}
        danger={false}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (file) importArchive.mutate(file, { onSuccess: () => setFile(null) });
        }}
      />
    </Stack>
  );
}
