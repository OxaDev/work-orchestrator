import { Button, Group, Modal, Radio, Stack, Switch, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconDownload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { exportMarkdown } from "../../components/markdown";
import { renderMermaid } from "../../components/mermaid";
import { appUrl } from "../../config";

/** "Copy as Markdown" and `.md` download (P7-11, ADR-0036). */
export function ExportModal({
  slug,
  content,
  onClose,
}: {
  slug: string;
  content: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("documents");
  const [links, setLinks] = useState<"text" | "absolute">("text");
  const [svg, setSvg] = useState(false);
  const [result, setResult] = useState<{ text: string; error?: string } | null>(null);

  useEffect(() => {
    let current = true;
    exportMarkdown(content, {
      links,
      appUrl: appUrl(),
      renderMermaid: svg ? (code) => renderMermaid(code) : undefined,
    }).then(
      (text) => current && setResult({ text }),
      (error: unknown) => current && setResult({ text: "", error: String(error) }),
    );
    return () => {
      current = false;
    };
  }, [content, links, svg]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result?.text ?? "");
      notifications.show({ color: "teal", message: t("export.copied") });
    } catch {
      notifications.show({ color: "red", message: t("export.copyFailed") });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([result?.text ?? ""], { type: "text/markdown" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${slug}.md` });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal opened onClose={onClose} title={t("export.title")} size="xl">
      <Stack>
        <Radio.Group
          label={t("export.links")}
          value={links}
          onChange={(value) => setLinks(value as "text" | "absolute")}
        >
          <Group mt="xs">
            <Radio value="text" label={t("export.linksText")} />
            <Radio value="absolute" label={t("export.linksAbsolute")} />
          </Group>
        </Radio.Group>
        <Switch
          label={t("export.mermaidSvg")}
          description={t("export.mermaidSvgHelp")}
          checked={svg}
          onChange={(event) => setSvg(event.currentTarget.checked)}
        />
        <Textarea
          readOnly
          autosize
          minRows={8}
          maxRows={20}
          label={t("export.result")}
          value={result?.error ? t("export.failed", { error: result.error }) : (result?.text ?? "")}
          styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={download}
            disabled={!result || Boolean(result.error)}
          >
            {t("export.download")}
          </Button>
          <Button
            leftSection={<IconCopy size={16} />}
            onClick={() => void copy()}
            disabled={!result || Boolean(result.error)}
          >
            {t("export.copy")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
