import type { Editor, Range } from "@tiptap/core";

import type { LinkType } from "../../../components/markdown";

/** What the editor component lends to commands that need the page (dialogs, uploads). */
export interface CommandHost {
  /** Opens the `[[` search restricted to these types (all when undefined). */
  linkTo: (types: LinkType[] | undefined) => void;
  /** Opens the file picker; the uploaded files are inserted at the cursor. */
  pickFile: () => void;
}

export interface SlashItem {
  id: string;
  /** Extra words matched by the filter, besides the translated label and the id. */
  keywords: string[];
  run: (editor: Editor, range: Range, host: CommandHost) => void;
}

const MERMAID_SAMPLE = "graph TD\n  A --> B";

/** The "/" menu (ADR-0043); labels are `documents:live.slash.<id>`. */
export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "paragraph",
    keywords: ["text", "texte", "p"],
    run: (e, range) => e.chain().focus().deleteRange(range).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map<SlashItem>((level) => ({
    id: `heading${level}`,
    keywords: ["title", "titre", "heading", `h${level}`],
    run: (e, range) => e.chain().focus().deleteRange(range).setHeading({ level }).run(),
  })),
  {
    id: "bulletList",
    keywords: ["ul", "liste", "list", "puces"],
    run: (e, range) => e.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    keywords: ["ol", "liste", "list", "numérotée", "numbered"],
    run: (e, range) => e.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "taskList",
    keywords: ["todo", "checkbox", "tâches", "tasks"],
    run: (e, range) => e.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "quote",
    keywords: ["blockquote", "citation"],
    run: (e, range) => e.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: "codeBlock",
    keywords: ["code", "pre", "bloc"],
    run: (e, range) => e.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    id: "mermaid",
    keywords: ["diagram", "diagramme", "graph", "schéma"],
    run: (e, range) =>
      e
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: MERMAID_SAMPLE }],
        })
        .run(),
  },
  {
    id: "table",
    keywords: ["tableau", "grid"],
    run: (e, range) =>
      e
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: "divider",
    keywords: ["hr", "separator", "séparateur", "ligne", "rule"],
    run: (e, range) => e.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "linkDocument",
    keywords: ["link", "lien", "page", "document", "wikilink", "url"],
    run: (e, range, host) => {
      e.chain().focus().deleteRange(range).run();
      host.linkTo(["document"]);
    },
  },
  {
    id: "linkEntity",
    keywords: ["link", "lien", "mission", "domain", "domaine", "contact", "company", "entreprise"],
    run: (e, range, host) => {
      e.chain().focus().deleteRange(range).run();
      host.linkTo(undefined);
    },
  },
  {
    id: "file",
    keywords: ["image", "upload", "fichier", "attachment", "pièce jointe"],
    run: (e, range, host) => {
      e.chain().focus().deleteRange(range).run();
      host.pickFile();
    },
  },
];

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Items whose label, id or keywords contain the query (accents and case ignored). */
export function filterSlashItems(
  items: SlashItem[],
  query: string,
  label: (item: SlashItem) => string,
): SlashItem[] {
  const needle = fold(query.trim());
  if (!needle) return items;
  return items.filter((item) =>
    [label(item), item.id, ...item.keywords].some((text) => fold(text).includes(needle)),
  );
}
