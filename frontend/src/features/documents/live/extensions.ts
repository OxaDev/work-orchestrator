import { Extension, type AnyExtension, type Editor, type Range } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";

import { attachmentUrl } from "../../../api/client";
import { CodeBlockView } from "./CodeBlockView";
import type { SlashItem } from "./slashItems";
import { Wikilink, type WikilinkAttrs } from "./wikilink";

/** One row of the floating menu shared by "/" and "[[". */
export interface MenuEntry {
  key: string;
  label: string;
  detail?: string;
}

export type MenuKind = "slash" | "wiki";

export interface MenuState {
  entries: MenuEntry[];
  loading: boolean;
  rect: DOMRect | null;
  select: (index: number) => void;
}

/**
 * Mutable bridge between ProseMirror plugins (created once) and the React component (re-rendered):
 * the component overwrites its fields on every render.
 */
export interface EditorBridge {
  onSave: () => void;
  showMenu: (kind: MenuKind, menu: MenuState | null) => void;
  /** Keyboard handling of the open menu; true when the key was consumed. */
  menuKeyDown: (event: KeyboardEvent) => boolean;
  slashItems: (query: string) => SlashItem[];
  runSlash: (item: SlashItem, editor: Editor, range: Range) => void;
  slashEntry: (item: SlashItem) => MenuEntry;
  searchLinks: (query: string) => Promise<WikilinkAttrs[]>;
  linkEntry: (link: WikilinkAttrs) => MenuEntry;
  placeholder: string;
}

/** Keeps `attachment:<uuid>` in the document, shows the file through the API (ADR-0036). */
function displayUrl(src: string | null): string | null {
  return src?.startsWith("attachment:") ? attachmentUrl(src.slice("attachment:".length)) : src;
}

const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        // The raw value survives copy and paste inside the editor.
        parseHTML: (element) => element.getAttribute("data-src") ?? element.getAttribute("src"),
        renderHTML: (attrs: { src: string | null }) => ({
          src: displayUrl(attrs.src),
          "data-src": attrs.src,
        }),
      },
    };
  },
}).configure({ inline: true });

const MermaidAwareCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

function menuRenderer<I>(bridge: EditorBridge, kind: MenuKind, entry: (item: I) => MenuEntry) {
  return () => {
    const show = (props: SuggestionProps<I, I>) =>
      bridge.showMenu(kind, {
        entries: props.items.map(entry),
        loading: props.loading,
        rect: props.clientRect?.() ?? null,
        select: (index) => {
          const item = props.items[index];
          if (item !== undefined) props.command(item);
        },
      });
    return {
      onStart: show,
      onUpdate: show,
      onExit: () => bridge.showMenu(kind, null),
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "Escape") {
          bridge.showMenu(kind, null);
          return false;
        }
        return bridge.menuKeyDown(event);
      },
    };
  };
}

export const slashKey = new PluginKey("wo-slash");
export const wikiKey = new PluginKey("wo-wikilink");

/** "/" commands and "[[" links (ADR-0043), plus Ctrl/Cmd+S. */
function commandsExtension(bridge: EditorBridge) {
  return Extension.create({
    name: "woCommands",
    addKeyboardShortcuts() {
      return {
        "Mod-s": () => {
          bridge.onSave();
          return true;
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: slashKey,
          char: "/",
          items: ({ query }) => bridge.slashItems(query),
          command: ({ editor, range, props }) => bridge.runSlash(props, editor, range),
          render: menuRenderer(bridge, "slash", (item: SlashItem) => bridge.slashEntry(item)),
        }),
        Suggestion<WikilinkAttrs, WikilinkAttrs>({
          editor: this.editor,
          pluginKey: wikiKey,
          char: "[[",
          allowSpaces: true,
          allowedPrefixes: null,
          items: ({ query }) => bridge.searchLinks(query),
          command: ({ editor, range, props }) => {
            // Auto-closed brackets typed after the query are replaced too.
            const after = editor.state.doc.textBetween(
              range.to,
              Math.min(range.to + 2, editor.state.doc.content.size),
            );
            const to = after === "]]" ? range.to + 2 : range.to;
            editor
              .chain()
              .focus()
              .insertContentAt({ from: range.from, to }, [
                { type: "wikilink", attrs: props },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: menuRenderer(bridge, "wiki", (link: WikilinkAttrs) => bridge.linkEntry(link)),
        }),
      ];
    },
  });
}

/** The schema of the live editor: GFM + wikilinks + attachments + Mermaid previews. */
export function liveExtensions(bridge: EditorBridge | null): AnyExtension[] {
  const base: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        isAllowedUri: (url, ctx) => url.startsWith("attachment:") || ctx.defaultValidate(url),
      },
    }),
    MermaidAwareCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    AttachmentImage,
    Wikilink,
    Markdown,
  ];
  if (!bridge) return base;
  return [
    ...base,
    Placeholder.configure({ placeholder: () => bridge.placeholder }),
    commandsExtension(bridge),
  ];
}
