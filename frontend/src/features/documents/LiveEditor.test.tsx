import { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { createQueryClient } from "../../app/queryClient";
import { liveExtensions } from "./live/extensions";
import { filterSlashItems, SLASH_ITEMS } from "./live/slashItems";
import { documentIdFromUrl } from "./live/documentUrl";
import { LiveEditor } from "./LiveEditor";

vi.mock("../../components/mermaid", () => ({
  renderMermaid: vi.fn(async () => `<svg data-testid="mermaid-svg"></svg>`),
}));

const DOC = "0190a8c4-0000-7000-8000-00000000000d";
vi.mock("./api", () => ({
  searchLinks: vi.fn(async (q: string, types?: string[]) =>
    [
      { type: "document", id: DOC, label: "Fiche paiements" },
      { type: "mission", id: "0190a8c4-0000-7000-8000-00000000000e", label: "Mission banque" },
    ].filter(
      (r) => r.label.toLowerCase().includes(q.toLowerCase()) && (!types || types.includes(r.type)),
    ),
  ),
  getDocumentTitle: vi.fn(async () => "Fiche paiements"),
}));

beforeAll(() => {
  // jsdom has no layout: ProseMirror measures ranges, which must at least exist.
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  Range.prototype.getClientRects = empty as unknown as Range["getClientRects"];
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});

const A = "0190a8c4-0000-7000-8000-00000000000a";
const B = "0190a8c4-0000-7000-8000-00000000000b";

/** Representative content: every construct must come back unchanged (ADR-0024, ADR-0043). */
const SAMPLE = `# Titre

Du **gras**, de l'*italique*, ~~barré~~ et \`code\`.

- un
- deux
  - imbriqué

1. a
2. b

- [ ] tâche
- [x] faite

> citation

\`\`\`ts
const a = 1;
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

| A   | B   |
| --- | --- |
| 1   | 2   |

![capture.png](attachment:${A})

[rapport.pdf](attachment:${B}) et [site](https://example.com)

Voir [[mission:${A}|la mission]] et [[contact:${B}]] ici.

---

fin`;

/** The serializer pads tables with blank lines; the Markdown is otherwise identical. */
const normalize = (markdown: string) => markdown.replace(/\n{3,}/g, "\n\n").trim();

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: liveExtensions(null),
    content: markdown,
    contentType: "markdown",
  });
  const result = editor.getMarkdown();
  editor.destroy();
  return result;
}

describe("live editor Markdown round-trip (ADR-0043)", () => {
  it("keeps GFM, code, Mermaid, attachments and wikilinks", () => {
    expect(normalize(roundTrip(SAMPLE))).toBe(normalize(SAMPLE));
  });

  it("parses wikilinks as atoms and keeps them out of code", () => {
    const editor = new Editor({
      extensions: liveExtensions(null),
      content: `[[document:${A}|Page]] \`[[document:${A}|code]]\``,
      contentType: "markdown",
    });
    const nodes: string[] = [];
    editor.state.doc.descendants((node) => {
      nodes.push(node.type.name);
    });
    expect(nodes.filter((n) => n === "wikilink")).toHaveLength(1);
    expect(editor.getMarkdown()).toBe(`[[document:${A}|Page]] \`[[document:${A}|code]]\``);
    editor.destroy();
  });

  it("recognises document URLs", () => {
    expect(documentIdFromUrl(`https://host/work-orchestrator/documents/${DOC}`)).toBe(DOC);
    expect(documentIdFromUrl(`/documents/${DOC.toUpperCase()}/`)).toBe(DOC);
    expect(documentIdFromUrl(`voir /documents/${DOC}`)).toBeNull();
    expect(documentIdFromUrl("https://example.com")).toBeNull();
  });
});

describe("slash menu items", () => {
  const label = (item: { id: string }) => item.id;
  it("filters by label, id and keywords, ignoring accents", () => {
    expect(filterSlashItems(SLASH_ITEMS, "", label)).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems(SLASH_ITEMS, "tableau", label).map((i) => i.id)).toEqual(["table"]);
    expect(filterSlashItems(SLASH_ITEMS, "SCHEMA", label).map((i) => i.id)).toEqual(["mermaid"]);
    expect(filterSlashItems(SLASH_ITEMS, "h2", label).map((i) => i.id)).toContain("heading2");
    expect(filterSlashItems(SLASH_ITEMS, "zzz", label)).toEqual([]);
  });
});

function setup(value = "") {
  const props = { onChange: vi.fn(), onSave: vi.fn(), onFiles: vi.fn(async () => []) };
  const router = createMemoryRouter(
    [{ path: "*", element: <LiveEditor value={value} label="Contenu" {...props} /> }],
    { initialEntries: ["/documents/x"] },
  );
  const result = render(
    <AppProviders queryClient={createQueryClient()} mantineEnv="test">
      <RouterProvider router={router} />
    </AppProviders>,
  );
  const dom = () => screen.getByRole("textbox", { name: "Contenu" });
  const editor = () => (dom() as unknown as { editor: Editor }).editor;
  return { ...result, ...props, dom, editor, router };
}

describe("LiveEditor", () => {
  it("renders Markdown and reports edits as Markdown", async () => {
    const { dom, editor, onChange } = setup(`# Titre\n\nVoir [[document:${DOC}|Fiche]].`);
    await waitFor(() => expect(dom().querySelector("h1")).toHaveTextContent("Titre"));
    expect(dom().querySelector("a.wo-wikilink")).toHaveTextContent("Fiche");
    act(() => {
      editor().commands.setTextSelection(editor().state.doc.content.size - 1);
      editor().commands.insertContent(" **ok**", { contentType: "markdown" });
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("**ok**"));
    expect(onChange.mock.lastCall![0]).toContain(`[[document:${DOC}|Fiche]]`);
  });

  it("saves with Ctrl+S", async () => {
    const { dom, onSave } = setup("texte");
    await waitFor(() => expect(dom()).toHaveTextContent("texte"));
    fireEvent.keyDown(dom(), { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it("runs a slash command chosen with the keyboard", async () => {
    const { dom, editor, onChange } = setup("");
    await waitFor(() => expect(dom()).toBeInTheDocument());
    act(() => {
      editor().commands.focus();
      editor().commands.insertContent("/tabl");
    });
    const menu = await screen.findByRole("listbox", { name: "Commandes" });
    expect(
      within(menu)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Tableau"]);
    fireEvent.keyDown(dom(), { key: "Enter" });
    await waitFor(() => expect(dom().querySelector("table")).not.toBeNull());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange.mock.lastCall![0]).toContain("| --- |");
  });

  it("navigates the slash menu with the arrows and turns a block into a heading", async () => {
    const { dom, editor } = setup("");
    await waitFor(() => expect(dom()).toBeInTheDocument());
    act(() => {
      editor().commands.focus();
      editor().commands.insertContent("/titre");
    });
    const menu = await screen.findByRole("listbox");
    expect(within(menu).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(dom(), { key: "ArrowDown" });
    await waitFor(() =>
      expect(within(menu).getByRole("option", { name: "Titre 2" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.keyDown(dom(), { key: "Enter" });
    await waitFor(() => expect(dom().querySelector("h2")).not.toBeNull());
  });

  it("links a document from the slash menu through the [[ search", async () => {
    const { dom, editor, onChange } = setup("");
    await waitFor(() => expect(dom()).toBeInTheDocument());
    act(() => {
      editor().commands.focus();
      editor().commands.insertContent("/lien");
    });
    fireEvent.click(await screen.findByRole("option", { name: "Lien vers un document" }));
    const menu = await screen.findByRole("listbox", { name: "Lier à…" });
    act(() => {
      editor().commands.insertContent("fiche");
    });
    // Restricted to documents: the mission is not offered.
    const option = await within(menu).findByRole("option", { name: /Fiche paiements/ });
    expect(within(menu).queryByText("Mission banque")).toBeNull();
    fireEvent.click(option);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining(`[[document:${DOC}|Fiche paiements]]`),
      ),
    );
  });

  it("shows the Mermaid diagram under its source", async () => {
    const { dom } = setup("```mermaid\ngraph TD\n  A --> B\n```");
    await waitFor(() => expect(dom().querySelector("[data-testid=mermaid-svg]")).not.toBeNull());
    expect(dom().querySelector("pre")).toHaveTextContent("graph TD");
  });

  it("follows outside changes without reporting them as edits", async () => {
    const props = { onChange: vi.fn(), onSave: vi.fn(), onFiles: vi.fn(async () => []) };
    function Host() {
      const [value, setValue] = useState("avant");
      return (
        <>
          <button type="button" onClick={() => setValue("# après")}>
            restore
          </button>
          <LiveEditor value={value} label="Contenu" {...props} />
        </>
      );
    }
    const router = createMemoryRouter([{ path: "*", element: <Host /> }]);
    render(
      <AppProviders queryClient={createQueryClient()} mantineEnv="test">
        <RouterProvider router={router} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveTextContent("avant"));
    fireEvent.click(screen.getByRole("button", { name: "restore" }));
    await waitFor(() => expect(screen.getByRole("textbox").querySelector("h1")).not.toBeNull());
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
