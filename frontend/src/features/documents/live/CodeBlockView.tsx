import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { MermaidDiagram } from "../../../components/MermaidDiagram";

/**
 * A fenced code block in the live editor: editable source, its language, and for ```mermaid the
 * rendered diagram under the source (ADR-0043).
 */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useTranslation("documents");
  const language = (node.attrs.language as string | null) ?? "";
  return (
    <NodeViewWrapper className="wo-live-code" data-language={language || undefined}>
      <input
        className="wo-live-code-language"
        contentEditable={false}
        aria-label={t("live.codeLanguage")}
        placeholder={t("live.codeLanguage")}
        value={language}
        readOnly={!editor.isEditable}
        onChange={(event) =>
          updateAttributes({ language: event.currentTarget.value.trim() || null })
        }
      />
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {language === "mermaid" && node.textContent.trim() && (
        <div className="wo-live-mermaid" contentEditable={false}>
          <MermaidDiagram code={node.textContent} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
