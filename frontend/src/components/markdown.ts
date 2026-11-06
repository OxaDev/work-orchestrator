/**
 * Markdown transformations shared by the preview and the export (ADR-0024, ADR-0036).
 * Wikilinks `[[type:uuid|label]]` and `attachment:<uuid>` references are rewritten outside
 * fenced and inline code only, like the backend parser.
 */

export const LINK_TYPES = [
  "document",
  "mission",
  "domain",
  "architecture",
  "contact",
  "company",
  "subject",
  "technology",
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const WIKILINK = new RegExp(
  `\\[\\[(${LINK_TYPES.join("|")}):(${UUID})(?:\\|([^\\]\\n|]*))?\\]\\]`,
  "g",
);
const ATTACHMENT = new RegExp(`attachment:(${UUID})`, "g");
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const INLINE_CODE = /(`+)(?:(?!\1)[\s\S])+?\1/g;

/** In-app route of an entity a wikilink points to. */
export function entityPath(type: LinkType, id: string, label = ""): string {
  switch (type) {
    case "document":
      return `/documents/${id}`;
    case "mission":
      return `/missions/${id}`;
    case "contact":
      return `/directory/contacts/${id}`;
    case "company":
      return `/directory/companies/${id}`;
    case "subject":
      return `/subjects/${id}`;
    case "technology":
      return `/directory/technologies?q=${encodeURIComponent(label)}`;
    default:
      return `/architecture/${type}s/${id}`;
  }
}

interface Segment {
  text: string;
  code: boolean;
  /** Language of a fenced block, for mermaid detection. */
  lang?: string;
}

/** Splits Markdown into code and prose segments (fenced blocks and inline code are code). */
export function segments(markdown: string): Segment[] {
  const result: Segment[] = [];
  const push = (text: string, code: boolean, lang?: string) => {
    const last = result.at(-1);
    if (last && last.code === code && !code) last.text += text;
    else result.push({ text, code, lang });
  };
  const lines = markdown.split(/(?<=\n)/);
  let fence: { marker: string; lang: string; text: string } | null = null;
  for (const line of lines) {
    const match = FENCE.exec(line.replace(/\n$/, ""));
    if (fence) {
      fence.text += line;
      const closing =
        match &&
        match[1]![0] === fence.marker[0] &&
        match[1]!.length >= fence.marker.length &&
        !match[2]!.trim();
      if (closing) {
        push(fence.text, true, fence.lang);
        fence = null;
      }
      continue;
    }
    if (match) {
      fence = { marker: match[1]!, lang: match[2]!.trim().split(/\s/)[0] ?? "", text: line };
      continue;
    }
    let last = 0;
    for (const inline of line.matchAll(INLINE_CODE)) {
      push(line.slice(last, inline.index), false);
      push(inline[0], true);
      last = inline.index + inline[0].length;
    }
    push(line.slice(last), false);
  }
  if (fence) push(fence.text, true, fence.lang);
  return result;
}

function mapProse(markdown: string, transform: (prose: string) => string): string {
  return segments(markdown)
    .map((segment) => (segment.code ? segment.text : transform(segment.text)))
    .join("");
}

const escapeLabel = (label: string) => label.replace(/([[\]\\])/g, "\\$1");

/** For the preview: wikilinks become `[label](wiki:type/id)` links. */
export function wikilinksToLinks(markdown: string): string {
  return mapProse(markdown, (prose) =>
    prose.replace(WIKILINK, (_, type: string, id: string, label?: string) => {
      const text = label?.trim() || type;
      return `[${escapeLabel(text)}](wiki:${type}/${id.toLowerCase()})`;
    }),
  );
}

export interface ExportOptions {
  /** "text": labels only (default); "absolute": links to this instance. */
  links: "text" | "absolute";
  /** Absolute application URL ending with "/", e.g. https://host/work-orchestrator/. */
  appUrl: string;
  /** Renders a Mermaid block to SVG; when given, diagrams are replaced by SVG images. */
  renderMermaid?: (code: string) => Promise<string>;
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * "Copy as Markdown" (P7-11): wikilinks to plain labels or absolute links, attachments to
 * absolute URLs, Mermaid optionally to SVG images for tools without Mermaid (Q-I3).
 */
export async function exportMarkdown(markdown: string, options: ExportOptions): Promise<string> {
  const appUrl = options.appUrl.endsWith("/") ? options.appUrl : `${options.appUrl}/`;
  const parts: string[] = [];
  let diagram = 0;
  for (const segment of segments(markdown)) {
    if (segment.code) {
      if (options.renderMermaid && segment.lang === "mermaid") {
        diagram += 1;
        const lines = segment.text.replace(/\n$/, "").split("\n");
        const closed = lines.length > 1 && FENCE.test(lines.at(-1)!);
        const code = lines.slice(1, closed ? -1 : undefined).join("\n");
        const svg = await options.renderMermaid(code);
        const trailing = segment.text.endsWith("\n") ? "\n" : "";
        parts.push(`![diagram ${diagram}](data:image/svg+xml;base64,${base64(svg)})${trailing}`);
      } else {
        parts.push(segment.text);
      }
      continue;
    }
    parts.push(
      segment.text
        .replace(WIKILINK, (_, type: LinkType, id: string, label?: string) => {
          const text = label?.trim() || type;
          return options.links === "absolute"
            ? `[${escapeLabel(text)}](${appUrl}${entityPath(type, id.toLowerCase(), text).slice(1)})`
            : text;
        })
        .replace(ATTACHMENT, (_, id: string) => `${appUrl}api/v1/attachments/${id.toLowerCase()}`),
    );
  }
  return parts.join("");
}

/**
 * Query typed after an unclosed `[[` at the end of `before` (text left of the cursor), or null.
 * Drives the wikilink completion (P7-9).
 */
export function wikiQuery(before: string): string | null {
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  return /[\]\n|]/.test(query) ? null : query;
}

export function wikilink(type: LinkType, id: string, label: string): string {
  return `[[${type}:${id}|${label
    .replace(/[[\]|\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()}]]`;
}

/** Markdown inserted after an upload: an image is shown, any other file is linked. */
export function attachmentMarkdown(file: { name: string; type: string }, id: string): string {
  const name = file.name.replace(/[[\]\n]/g, " ").trim() || "file";
  return file.type.startsWith("image/")
    ? `![${name}](attachment:${id})`
    : `[${name}](attachment:${id})`;
}
