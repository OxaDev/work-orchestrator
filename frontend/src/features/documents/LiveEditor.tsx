import { Typography } from "@mantine/core";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import "../../components/markdown.css";
import { entityPath, type LinkType } from "../../components/markdown";
import { getDocumentTitle, searchLinks } from "./api";
import {
  type EditorBridge,
  liveExtensions,
  type MenuKind,
  type MenuState,
} from "./live/extensions";
import { documentIdFromUrl } from "./live/documentUrl";
import "./live/live.css";
import { type CommandHost, filterSlashItems, SLASH_ITEMS } from "./live/slashItems";
import { SuggestionMenu } from "./live/SuggestionMenu";
import type { WikilinkAttrs } from "./live/wikilink";
import type { MarkdownEditorProps } from "./MarkdownEditor";

async function documentLink(id: string): Promise<WikilinkAttrs | null> {
  const title = await getDocumentTitle(id).catch(() => null);
  return title === null ? null : { type: "document", id, label: title };
}

/**
 * Live Markdown editor (ADR-0043): WYSIWYG editing of the same Markdown the source editor shows,
 * "/" commands, "[[" links, file paste and drop, Ctrl/Cmd+S. Same props as `MarkdownEditor`.
 */
export function LiveEditor({ value, onChange, onSave, onFiles, label }: MarkdownEditorProps) {
  const { t } = useTranslation("documents");
  const navigate = useNavigate();
  const [menus, setMenus] = useState<Record<MenuKind, MenuState | null>>({
    slash: null,
    wiki: null,
  });
  const [active, setActive] = useState(0);
  const menu = menus.wiki ?? menus.slash;
  const editorRef = useRef<Editor | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Markdown last sent to the page: a different `value` comes from outside (restore, draft).
  const emitted = useRef(value);
  const linkTypes = useRef<LinkType[] | undefined>(undefined);
  const view = useRef({ menu, active, onChange, onSave, onFiles, t, navigate });
  useLayoutEffect(() => {
    view.current = { menu, active, onChange, onSave, onFiles, t, navigate };
  });

  const insertMarkdown = (markdown: string, at?: number) => {
    const editor = editorRef.current;
    if (!editor || !markdown) return;
    const chain = editor.chain().focus();
    (at === undefined
      ? chain.insertContent(markdown, { contentType: "markdown" })
      : chain.insertContentAt(at, markdown, { contentType: "markdown" })
    ).run();
  };
  const uploadAndInsert = (files: File[], at?: number) =>
    void view.current.onFiles(files).then((snippets) => insertMarkdown(snippets.join("\n"), at));

  const [bridge] = useState<EditorBridge>(() => {
    const host = (editor: Editor): CommandHost => ({
      linkTo: (types) => {
        linkTypes.current = types;
        // Typing "[[" opens the link search, like in the source editor.
        editor.chain().focus().insertContent("[[").run();
      },
      pickFile: () => fileInput.current?.click(),
    });
    const slashLabel = (id: string) => view.current.t(`live.slash.${id}`);
    return {
      onSave: () => view.current.onSave(),
      showMenu: (kind, state) => {
        if (kind === "wiki" && state === null) linkTypes.current = undefined;
        setMenus((current) => ({ ...current, [kind]: state }));
        setActive(0);
        view.current.active = 0;
      },
      menuKeyDown: (event) => {
        const { menu: open, active: index } = view.current;
        const count = open?.entries.length ?? 0;
        if (!open || count === 0) return false;
        const move = (next: number) => {
          view.current.active = next;
          setActive(next);
          return true;
        };
        if (event.key === "ArrowDown") return move((index + 1) % count);
        if (event.key === "ArrowUp") return move((index - 1 + count) % count);
        if (event.key === "Enter" || event.key === "Tab") {
          open.select(index);
          return true;
        }
        return false;
      },
      slashItems: (query) => filterSlashItems(SLASH_ITEMS, query, (item) => slashLabel(item.id)),
      runSlash: (item, editor, range) => item.run(editor, range, host(editor)),
      slashEntry: (item) => ({ key: item.id, label: slashLabel(item.id) }),
      searchLinks: async (query) => {
        const id = documentIdFromUrl(query);
        if (id) {
          const link = await documentLink(id);
          return link ? [link] : [];
        }
        const results = await searchLinks(query, linkTypes.current).catch(() => []);
        return results.map((r) => ({ type: r.type, id: r.id, label: r.label }));
      },
      linkEntry: (link) => ({
        key: `${link.type}:${link.id}`,
        label: link.label,
        detail: view.current.t(`types.${link.type}`),
      }),
      placeholder: t("live.placeholder"),
    };
  });

  const editor = useEditor({
    extensions: liveExtensions(bridge),
    content: value,
    contentType: "markdown",
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class: "wo-live-content",
      },
      handlePaste: (_, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length) {
          event.preventDefault();
          uploadAndInsert(files);
          return true;
        }
        const id = documentIdFromUrl(event.clipboardData?.getData("text/plain") ?? "");
        if (!id) return false;
        event.preventDefault();
        void documentLink(id).then((link) => {
          if (link)
            editorRef.current
              ?.chain()
              .focus()
              .insertContent([
                { type: "wikilink", attrs: link },
                { type: "text", text: " " },
              ])
              .run();
        });
        return true;
      },
      handleDrop: (target, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length) return false;
        event.preventDefault();
        const at = target.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        uploadAndInsert(files, at);
        return true;
      },
      // Ctrl/Cmd+click opens a wikilink; a plain click only places the cursor.
      handleClickOn: (_, __, node, ___, event) => {
        if (node.type.name !== "wikilink" || !(event.ctrlKey || event.metaKey)) return false;
        event.preventDefault();
        const { type, id, label: text } = node.attrs as WikilinkAttrs;
        void view.current.navigate(entityPath(type, id, text || type));
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      emitted.current = markdown;
      view.current.onChange(markdown);
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  return (
    <>
      <Typography className="wo-markdown wo-live">
        <EditorContent editor={editor} />
      </Typography>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label={t("insertFile")}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) uploadAndInsert(files);
        }}
      />
      {menu && (
        <SuggestionMenu
          menu={menu}
          active={active}
          label={t(menus.wiki ? "live.linkMenu" : "live.slashMenu")}
          onHover={(index) => {
            view.current.active = index;
            setActive(index);
          }}
        />
      )}
    </>
  );
}

export default LiveEditor;
