import { Anchor, Text, Typography } from "@mantine/core";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown";
import { Link } from "react-router";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { attachmentUrl } from "../api/client";
import "./markdown.css";
import { entityPath, type LinkType, wikilinksToLinks } from "./markdown";
import { MermaidDiagram } from "./MermaidDiagram";

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

const text = (node: HastNode): string => node.value ?? (node.children ?? []).map(text).join("");

const plain = (children: ReactNode): string =>
  Array.isArray(children)
    ? children.map(plain).join("")
    : typeof children === "string"
      ? children
      : "";

/** Keeps the app's own schemes, which the default transform would strip. */
function urlTransform(url: string): string {
  if (url.startsWith("wiki:")) return url;
  if (url.startsWith("attachment:")) return attachmentUrl(url.slice("attachment:".length));
  return defaultUrlTransform(url);
}

const components: Components = {
  a({ href = "", children }) {
    if (href.startsWith("wiki:")) {
      const [type, id] = href.slice(5).split("/") as [LinkType, string];
      return (
        <Anchor component={Link} to={entityPath(type, id, plain(children))}>
          {children}
        </Anchor>
      );
    }
    return (
      <Anchor href={href} target="_blank" rel="noreferrer">
        {children}
      </Anchor>
    );
  },
  pre({ node, children }) {
    const code = (node as HastNode | undefined)?.children?.[0];
    const classes = code?.properties?.className;
    if (Array.isArray(classes) && classes.includes("language-mermaid")) {
      return <MermaidDiagram code={text(code!).replace(/\n$/, "")} />;
    }
    return <pre>{children}</pre>;
  },
};

/**
 * Read-only GitHub Flavored Markdown (ADR-0024, ADR-0036): Mermaid diagrams, highlighted code,
 * wikilinks as in-app links, `attachment:` files served by the API. Raw HTML is not rendered.
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
    <Typography className="wo-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { plainText: ["mermaid"] }]]}
        urlTransform={urlTransform}
        components={components}
      >
        {wikilinksToLinks(source)}
      </ReactMarkdown>
    </Typography>
  );
}
