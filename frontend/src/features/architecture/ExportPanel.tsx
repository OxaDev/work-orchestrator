import {
  Button,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { renderMermaid } from "../../components/mermaid";
import { MermaidDiagram } from "../../components/MermaidDiagram";
import { type MermaidOptions, useMermaid } from "./api";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** SVG to PNG through a canvas, in the browser: nothing leaves the machine (ADR-0028). */
async function svgToPng(svg: string): Promise<Blob> {
  const image = new Image();
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg"));
      image.src = source;
    });
    const scale = 2;
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.max(1, image.naturalWidth * scale),
      height: Math.max(1, image.naturalHeight * scale),
    });
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(source);
  }
}

/** Mermaid export of an architecture (P9-11, ADR-0025, ADR-0038). */
export function ExportPanel({
  architectureId,
  name,
  view,
  onClose,
}: {
  architectureId: string;
  name: string;
  view: MermaidOptions["view"];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("architecture");
  const [options, setOptions] = useState<MermaidOptions>({
    format: "flowchart",
    direction: "LR",
    view,
    depth: null,
    lang: i18n.language === "en" ? "en" : "fr",
  });
  const mermaid = useMermaid(architectureId, options);
  const code = mermaid.data?.code ?? "";
  const base = name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "architecture";
  const set = (changes: Partial<MermaidOptions>) =>
    setOptions((current) => ({ ...current, ...changes }));
  const fail = () => notifications.show({ color: "red", message: t("export.failed") });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notifications.show({ color: "teal", message: t("export.copied") });
    } catch {
      fail();
    }
  };
  const image = async (type: "svg" | "png") => {
    try {
      const svg = await renderMermaid(code);
      download(
        `${base}.${type}`,
        type === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await svgToPng(svg),
      );
    } catch {
      fail();
    }
  };

  return (
    <Modal opened onClose={onClose} title={t("export.title")} size="90%">
      <Stack>
        <Group align="flex-end">
          <SegmentedControl
            aria-label={t("export.format")}
            value={options.format}
            onChange={(value) => set({ format: value as MermaidOptions["format"] })}
            data={[
              { value: "flowchart", label: t("export.flowchart") },
              { value: "mindmap", label: t("export.mindmap") },
            ]}
          />
          <SegmentedControl
            aria-label={t("export.direction")}
            disabled={options.format === "mindmap"}
            value={options.direction}
            onChange={(value) => set({ direction: value as "LR" | "TB" })}
            data={[
              { value: "LR", label: t("export.lr") },
              { value: "TB", label: t("export.tb") },
            ]}
          />
          <SegmentedControl
            aria-label={t("graph.view")}
            value={options.view}
            onChange={(value) => set({ view: value as MermaidOptions["view"] })}
            data={(["CURRENT", "TARGET", "BOTH"] as const).map((v) => ({
              value: v,
              label: t(`graph.views.${v}`),
            }))}
          />
          <NumberInput
            label={t("graph.depth")}
            placeholder={t("graph.allLevels")}
            min={0}
            max={50}
            w={140}
            value={options.depth ?? ""}
            onChange={(value) => set({ depth: typeof value === "number" ? value : null })}
          />
        </Group>
        <Grid>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <ScrollArea.Autosize mah="60vh">
              {mermaid.isPending ? <Loader size="sm" /> : <MermaidDiagram code={code} />}
            </ScrollArea.Autosize>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Textarea
              readOnly
              label={t("export.code")}
              autosize
              minRows={12}
              maxRows={24}
              value={code}
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 },
              }}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {t("export.help")}
            </Text>
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            disabled={!code}
            onClick={() => download(`${base}.mmd`, new Blob([code], { type: "text/plain" }))}
          >
            .mmd
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            disabled={!code}
            onClick={() => void image("svg")}
          >
            .svg
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            disabled={!code}
            onClick={() => void image("png")}
          >
            .png
          </Button>
          <Button leftSection={<IconCopy size={16} />} disabled={!code} onClick={() => void copy()}>
            {t("export.copy")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
