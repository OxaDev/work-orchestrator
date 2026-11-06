import { Alert, Code, Loader, useComputedColorScheme } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { renderMermaid } from "./mermaid";

/** A ```mermaid block rendered as a diagram; the source is shown when it does not parse. */
export function MermaidDiagram({ code }: { code: string }) {
  const { t } = useTranslation();
  const dark = useComputedColorScheme("light") === "dark";
  const [state, setState] = useState<{ svg?: string; error?: string }>({});

  useEffect(() => {
    let current = true;
    renderMermaid(code, dark).then(
      (svg) => current && setState({ svg }),
      (error: unknown) => current && setState({ error: String(error) }),
    );
    return () => {
      current = false;
    };
  }, [code, dark]);

  if (state.error) {
    return (
      <Alert color="orange" title={t("markdown.mermaidError")}>
        <Code block>{code}</Code>
      </Alert>
    );
  }
  if (!state.svg) return <Loader size="xs" />;
  return (
    <div
      role="img"
      aria-label={t("markdown.diagram")}
      style={{ overflowX: "auto" }}
      // Mermaid output in "strict" mode is sanitized by Mermaid itself (DOMPurify).
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
