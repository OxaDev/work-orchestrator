import { Alert, Button, FileInput, Group, List, Modal, Stack, Text } from "@mantine/core";
import { IconFileZip } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useErrorMessage } from "../../i18n/useErrorMessage";
import { useImportMarkdown } from "../data/api";

/** Imports a zipped folder of Markdown notes, Obsidian vaults included (P11-6, ADR-0040). */
export function MarkdownImportModal({
  projectId,
  onClose,
}: {
  projectId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("data");
  const errorMessage = useErrorMessage();
  const [file, setFile] = useState<File | null>(null);
  const importMarkdown = useImportMarkdown();
  const report = importMarkdown.data;

  return (
    <Modal opened onClose={onClose} title={t("markdown.title")} size="lg">
      <Stack>
        <Text size="sm">{t("markdown.help")}</Text>
        <FileInput
          label={t("markdown.file")}
          placeholder={t("archive.choose")}
          accept=".zip,application/zip"
          leftSection={<IconFileZip size={16} />}
          value={file}
          onChange={(value) => {
            setFile(value);
            importMarkdown.reset();
          }}
          clearable
        />
        {importMarkdown.error && <Alert color="red">{errorMessage(importMarkdown.error)}</Alert>}
        {report && (
          <Alert color="teal" title={t("markdown.done")}>
            <List size="sm">
              <List.Item>{t("markdown.documents", { count: report.documents })}</List.Item>
              <List.Item>{t("markdown.folders", { count: report.folders })}</List.Item>
              <List.Item>{t("markdown.attachments", { count: report.attachments })}</List.Item>
              {report.unresolved_links > 0 && (
                <List.Item>
                  {t("markdown.unresolved", { count: report.unresolved_links })}
                </List.Item>
              )}
              {report.skipped_files > 0 && (
                <List.Item>{t("markdown.skipped", { count: report.skipped_files })}</List.Item>
              )}
            </List>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("close")}
          </Button>
          {!report && (
            <Button
              disabled={!file}
              loading={importMarkdown.isPending}
              onClick={() =>
                file && importMarkdown.mutate({ file, projectId: projectId ?? undefined })
              }
            >
              {t("markdown.import")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
