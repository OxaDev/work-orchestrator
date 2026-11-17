import { mergeAttributes, Node } from "@tiptap/core";

import { entityPath, LINK_TYPES, type LinkType } from "../../../components/markdown";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** Same syntax as `components/markdown.ts` and the backend parser (ADR-0024). */
const WIKILINK_AT_START = new RegExp(
  `^\\[\\[(${LINK_TYPES.join("|")}):(${UUID})(?:\\|([^\\]\\n|]*))?\\]\\]`,
);

export interface WikilinkAttrs {
  type: LinkType;
  id: string;
  /** Empty when the source had no label (`[[contact:<uuid>]]`): kept that way on save. */
  label: string;
}

/** Markdown of a wikilink node; a label is cleaned the same way as the `[[` completion. */
export function renderWikilink({ type, id, label }: WikilinkAttrs): string {
  const clean = label
    .replace(/[[\]|\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? `[[${type}:${id}|${clean}]]` : `[[${type}:${id}]]`;
}

/**
 * `[[type:uuid|label]]` as an inline atom (ADR-0043): shown as an in-app link chip, written back
 * verbatim to Markdown so backlinks keep working (ADR-0024).
 */
export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      type: { default: "document" },
      id: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-wikilink]",
        getAttrs: (element) => ({
          type: element.getAttribute("data-link-type"),
          id: element.getAttribute("data-id"),
          label: element.getAttribute("data-label") ?? "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { type, id, label } = node.attrs as WikilinkAttrs;
    const text = label || type;
    // Router paths start with "/": prefix the base path (ADR-0011) for a real, copyable href.
    const href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}${entityPath(type, id, text)}`;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href,
        class: "wo-wikilink",
        "data-wikilink": "",
        "data-link-type": type,
        "data-id": id,
        "data-label": label,
      }),
      text,
    ];
  },

  renderText({ node }) {
    const { type, label } = node.attrs as WikilinkAttrs;
    return label || type;
  },

  markdownTokenName: "wikilink",
  markdownTokenizer: {
    name: "wikilink",
    level: "inline",
    start: (src: string) => src.indexOf("[["),
    tokenize(src: string) {
      const match = WIKILINK_AT_START.exec(src);
      if (!match) return undefined;
      return {
        type: "wikilink",
        raw: match[0],
        linkType: match[1],
        id: match[2]!.toLowerCase(),
        label: (match[3] ?? "").trim(),
      };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("wikilink", {
      type: token.linkType as LinkType,
      id: token.id as string,
      label: token.label as string,
    });
  },
  renderMarkdown(node) {
    return renderWikilink(node.attrs as WikilinkAttrs);
  },
});
