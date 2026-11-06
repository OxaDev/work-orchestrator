import { Alert, Button, FileInput, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { type CsvImportReport, useImportContacts } from "../data/api";

const MAX_ERRORS_SHOWN = 50;

function Report({ report }: { report: CsvImportReport }) {
  const { t } = useTranslation("data");
  return (
    <Stack gap="xs">
      <Text size="sm">
        {t("csv.preview", {
          created: report.created,
          skipped: report.skipped,
          companies: report.companies_created,
        })}
      </Text>
      {report.errors.length > 0 && (
        <Alert color="orange" title={t("csv.errors", { count: report.errors.length })}>
          <Table withRowBorders={false} verticalSpacing={2} fz="sm">
            <Table.Tbody>
              {report.errors.slice(0, MAX_ERRORS_SHOWN).map((error) => (
                <Table.Tr key={`${error.line}-${error.field ?? ""}-${error.code}`}>
                  <Table.Td>{t("csv.line", { line: error.line })}</Table.Td>
                  <Table.Td>{error.field ? t(`csv.columns.${error.field}`) : ""}</Table.Td>
                  <Table.Td>{t(`csv.codes.${error.code}`)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Alert>
      )}
    </Stack>
  );
}

/**
 * Contacts from a CSV (P11-7, ADR-0040): a dry run previews what would be created, skipped
 * or refused, then the import runs for real.
 */
export function ContactsCsvModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("data");
  const errorMessage = useErrorMessage();
  const [file, setFile] = useState<File | null>(null);
  const preview = useImportContacts();
  const commit = useImportContacts();

  const choose = (value: File | null) => {
    setFile(value);
    preview.reset();
    if (value) preview.mutate({ file: value, dryRun: true });
  };

  return (
    <Modal opened onClose={onClose} title={t("csv.title")} size="lg">
      <Stack>
        <Text size="sm">{t("csv.help")}</Text>
        <FileInput
          label={t("csv.file")}
          placeholder={t("archive.choose")}
          accept=".csv,text/csv"
          leftSection={<IconFileTypeCsv size={16} />}
          value={file}
          onChange={choose}
          clearable
        />
        {(preview.error ?? commit.error) && (
          <Alert color="red">{errorMessage(preview.error ?? commit.error)}</Alert>
        )}
        {preview.data && <Report report={preview.data} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            disabled={!file || !preview.data || preview.data.created === 0}
            loading={preview.isPending || commit.isPending}
            onClick={() =>
              file &&
              commit.mutate(
                { file, dryRun: false },
                {
                  onSuccess: (report) => {
                    notifications.show({
                      color: "teal",
                      message: t("csv.done", { count: report.created }),
                    });
                    onClose();
                  },
                },
              )
            }
          >
            {t("csv.import", { count: preview.data?.created ?? 0 })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
