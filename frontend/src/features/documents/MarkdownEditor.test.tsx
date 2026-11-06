import { EditorView } from "@codemirror/view";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor";

beforeAll(() => {
  // jsdom has no layout: CodeMirror measures ranges, which must at least exist.
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  Range.prototype.getClientRects = empty as unknown as Range["getClientRects"];
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

function setup(value = "# Titre") {
  const props = {
    onChange: vi.fn(),
    onSave: vi.fn(),
    onFiles: vi.fn(async (files: File[]) => files.map((f) => `![${f.name}](attachment:x)`)),
  };
  const result = render(<MarkdownEditor value={value} label="Contenu" {...props} />);
  const content = result.container.querySelector<HTMLElement>(".cm-content")!;
  const view = EditorView.findFromDOM(content)!;
  return { ...result, ...props, content, view };
}

describe("MarkdownEditor (CodeMirror 6)", () => {
  it("shows the value, labels the editor and follows external changes", () => {
    const { content, view, rerender, onChange, onSave, onFiles } = setup();
    expect(content).toHaveAttribute("aria-label", "Contenu");
    expect(view.state.doc.toString()).toBe("# Titre");
    rerender(
      <MarkdownEditor value="# Restauré" label="Contenu" {...{ onChange, onSave, onFiles }} />,
    );
    expect(view.state.doc.toString()).toBe("# Restauré");
  });

  it("reports edits and saves with Ctrl+S", () => {
    const { view, content, onChange, onSave } = setup();
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nTexte" } });
    expect(onChange).toHaveBeenLastCalledWith("# Titre\nTexte");
    fireEvent.keyDown(content, { key: "s", code: "KeyS", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("uploads pasted files and inserts their Markdown at the cursor (P7-10)", async () => {
    const { view, content, onFiles } = setup("");
    const file = new File(["png"], "capture.png", { type: "image/png" });
    fireEvent.paste(content, { clipboardData: { files: [file], getData: () => "" } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    await waitFor(() => expect(view.state.doc.toString()).toBe("![capture.png](attachment:x)"));
    // Plain text paste is left to CodeMirror.
    fireEvent.paste(content, { clipboardData: { files: [], getData: () => "texte" } });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});
