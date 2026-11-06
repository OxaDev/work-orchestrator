import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { wikilink, wikiQuery } from "../../components/markdown";
import { searchLinks } from "./api";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl/Cmd+S. */
  onSave: () => void;
  /** Uploads pasted or dropped files; returns the Markdown to insert for each. */
  onFiles: (files: File[]) => Promise<string[]>;
  label: string;
}

/**
 * CodeMirror 6 Markdown editor (ADR-0024, ADR-0036): syntax colouring, `[[` completion on every
 * linkable entity, file paste and drop, Ctrl/Cmd+S to save.
 */
export function MarkdownEditor({ value, onChange, onSave, onFiles, label }: MarkdownEditorProps) {
  const { t } = useTranslation("documents");
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks change on every render; the editor reads the latest ones through this ref.
  const callbacks = useRef({ onChange, onSave, onFiles, t });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onFiles, t };
  });

  useEffect(() => {
    const insertFiles = (target: EditorView, files: File[], at: number) => {
      void callbacks.current.onFiles(files).then((snippets) => {
        if (!snippets.length) return;
        const text = snippets.join("\n");
        target.dispatch({
          changes: { from: at, insert: text },
          selection: { anchor: at + text.length },
        });
      });
    };
    const completion = async (context: CompletionContext) => {
      const line = context.state.doc.lineAt(context.pos);
      const before = line.text.slice(0, context.pos - line.from);
      const query = wikiQuery(before);
      if (query === null) return null;
      const from = line.from + before.lastIndexOf("[[");
      const results = await searchLinks(query);
      return {
        from,
        filter: false,
        options: results.map((result) => ({
          label: result.label,
          detail: callbacks.current.t(`types.${result.type}`),
          apply: (target: EditorView, _: unknown, start: number, end: number) => {
            const text = wikilink(result.type, result.id, result.label);
            // Auto-closed brackets ("[[]]") are replaced too.
            const stop = target.state.sliceDoc(end, end + 2) === "]]" ? end + 2 : end;
            target.dispatch({
              changes: { from: start, to: stop, insert: text },
              selection: { anchor: start + text.length },
            });
          },
        })),
      };
    };
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          autocompletion({ override: [completion] }),
          Prec.highest(
            keymap.of([
              { key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) },
            ]),
          ),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event, target) {
              const files = [...(event.clipboardData?.files ?? [])];
              if (!files.length) return false;
              event.preventDefault();
              insertFiles(target, files, target.state.selection.main.head);
              return true;
            },
            drop(event, target) {
              const files = [...(event.dataTransfer?.files ?? [])];
              if (!files.length) return false;
              event.preventDefault();
              const at = target.posAtCoords({ x: event.clientX, y: event.clientY });
              insertFiles(target, files, at ?? target.state.selection.main.head);
              return true;
            },
          }),
          EditorView.theme({
            "&": {
              minHeight: "60vh",
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "4px",
            },
            ".cm-scroller": {
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: "13px",
            },
            // CodeMirror's default highlight is too light for text contrast in dark mode.
            ".cm-activeLine, .cm-activeLineGutter": {
              backgroundColor: "var(--mantine-color-default-hover)",
            },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; later `value` changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} />;
}
