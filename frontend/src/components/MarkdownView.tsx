import { Text, Typography } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Read-only GitHub Flavored Markdown (ADR-0024). Raw HTML is not rendered, so stored notes
 * cannot inject markup. Mermaid and wikilinks arrive with the documents module (P7).
 */
export function MarkdownView({ source, empty }: { source: string; empty?: string }) {
  if (!source.trim()) {
    return empty ? (
      <Text c="dimmed" size="sm">
        {empty}
      </Text>
    ) : null;
  }
  return (
    <Typography>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </Typography>
  );
}
