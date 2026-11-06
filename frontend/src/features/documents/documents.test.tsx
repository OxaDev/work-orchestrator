import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  attachmentMarkdown,
  entityPath,
  exportMarkdown,
  segments,
  wikilink,
  wikilinksToLinks,
  wikiQuery,
} from "../../components/markdown";
import { docIds, docs } from "../../test/documentsBackend";
import { missionIds } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";
import type { MarkdownEditorProps } from "./MarkdownEditor";

// jsdom has no SVG layout engine: Mermaid is replaced by a predictable renderer.
vi.mock("../../components/mermaid", () => ({
  renderMermaid: vi.fn(async (code: string) => {
    if (code.includes("oops")) throw new Error("Parse error");
    return `<svg data-testid="mermaid-svg"><text>${code.length}</text></svg>`;
  }),
}));

// CodeMirror cannot be driven reliably in jsdom; pages are tested with a textarea standing in
// for it (the real editor has its own smoke test).
vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: (props: MarkdownEditorProps) => (
    <div>
      <textarea
        aria-label={props.label}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() =>
          void props
            .onFiles([new File(["png"], "capture.png", { type: "image/png" })])
            .then((snippets) => props.onChange(`${props.value}${snippets.join("\n")}`))
        }
      >
        paste-image
      </button>
      <button type="button" onClick={props.onSave}>
        ctrl-s
      </button>
    </div>
  ),
}));

const A = "0190a8c4-0000-7000-8000-00000000000a";
const B = "0190a8c4-0000-7000-8000-00000000000b";

describe("markdown transformations (ADR-0024, ADR-0036)", () => {
  const source = [
    `Voir [[mission:${A}|la mission]] et [[contact:${B}]].`,
    "",
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    `Code : \`[[mission:${A}|pas un lien]]\``,
    "",
    "```",
    `[[company:${B}|dans un bloc]]`,
    "```",
    `![schéma](attachment:${B})`,
  ].join("\n");

  it("splits code from prose", () => {
    const code = segments(source).filter((s) => s.code);
    expect(code.map((s) => s.lang)).toEqual(["mermaid", undefined, ""]);
  });

  it("turns wikilinks into links for the preview, outside code only", () => {
    const out = wikilinksToLinks(source);
    expect(out).toContain(`[la mission](wiki:mission/${A})`);
    expect(out).toContain(`[contact](wiki:contact/${B})`);
    expect(out).toContain(`\`[[mission:${A}|pas un lien]]\``);
    expect(out).toContain(`[[company:${B}|dans un bloc]]`);
    // Same reading as the backend parser: the label stops at the first "]]".
    expect(wikilinksToLinks(`[[document:${A}|a [b]]]`)).toBe(`[a \\[b](wiki:document/${A})]`);
  });

  it("exports labels or absolute links, absolute attachments, untouched code", async () => {
    const text = await exportMarkdown(source, { links: "text", appUrl: "https://wo.local/app" });
    expect(text.split("\n")[0]).toBe("Voir la mission et contact.");
    expect(text).toContain(`![schéma](https://wo.local/app/api/v1/attachments/${B})`);
    expect(text).toContain("```mermaid\nflowchart LR");
    expect(text).toContain(`[[company:${B}|dans un bloc]]`);

    const absolute = await exportMarkdown(source, {
      links: "absolute",
      appUrl: "https://wo.local/app/",
    });
    expect(absolute.split("\n")[0]).toBe(
      `Voir [la mission](https://wo.local/app/missions/${A}) et [contact](https://wo.local/app/directory/contacts/${B}).`,
    );
  });

  it("replaces Mermaid blocks with SVG images on demand (Q-I3)", async () => {
    const render = vi.fn(async (code: string) => `<svg>${code}</svg>`);
    const text = await exportMarkdown(source, {
      links: "text",
      appUrl: "/",
      renderMermaid: render,
    });
    expect(render).toHaveBeenCalledWith("flowchart LR\n  A --> B");
    expect(text).toContain("![diagram 1](data:image/svg+xml;base64,");
    expect(text).not.toContain("```mermaid");
    const unclosed = await exportMarkdown("```mermaid\ngraph TD", {
      links: "text",
      appUrl: "/",
      renderMermaid: render,
    });
    expect(render).toHaveBeenLastCalledWith("graph TD");
    expect(unclosed).toMatch(/^!\[diagram 1\]/);
  });

  it("drives the [[ completion and builds links", () => {
    expect(wikiQuery("Voir [[hori")).toBe("hori");
    expect(wikiQuery("Voir [[")).toBe("");
    expect(wikiQuery("Voir [[x]] puis")).toBeNull();
    expect(wikiQuery("pas de lien")).toBeNull();
    expect(wikilink("mission", A, "Horizon | [v2]")).toBe(`[[mission:${A}|Horizon v2]]`);
    expect(attachmentMarkdown({ name: "a.png", type: "image/png" }, A)).toBe(
      `![a.png](attachment:${A})`,
    );
    expect(attachmentMarkdown({ name: "spec.pdf", type: "application/pdf" }, A)).toBe(
      `[spec.pdf](attachment:${A})`,
    );
    expect(entityPath("company", A)).toBe(`/directory/companies/${A}`);
    expect(entityPath("technology", A, "Kafka")).toBe("/directory/technologies?q=Kafka");
    expect(entityPath("domain", A)).toBe(`/architecture/domains/${A}`);
  });
});

describe("documents (P7-7 to P7-12)", () => {
  it("shows the page tree and creates a document from a template", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/documents");
    const tree = await screen.findByRole("tree", { name: "Documents" });
    expect(within(tree).getByText("Flux de paiement").closest('[role="treeitem"]')).toHaveAttribute(
      "aria-level",
      "2",
    );

    await user.click(
      screen.getByRole("button", { name: "Nouvelle sous-page de Architecture Horizon" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nouveau document" });
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    expect(await within(dialog).findByText("Obligatoire.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Titre" }), "CR du 6 novembre");
    await user.click(within(dialog).getByRole("combobox", { name: "Modèle" }));
    await user.click(await screen.findByRole("option", { name: "Compte rendu de réunion" }));
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/));
    expect(docs.lastBody).toMatchObject({
      title: "CR du 6 novembre",
      parent_id: docIds.root,
      template_id: docIds.template,
    });
    expect(await screen.findByRole("heading", { name: "Réunion" })).toBeInTheDocument();
  });

  it("edits with live preview, autosaves a draft, saves a version", async () => {
    const user = userEvent.setup();
    renderApp(`/documents/${docIds.root}`);
    const editor = await screen.findByRole("textbox", { name: "Contenu Markdown" });
    const preview = screen.getByRole("region", { name: "Aperçu" });
    expect(within(preview).getByRole("heading", { name: "Horizon" })).toBeInTheDocument();

    fireEvent.change(editor, {
      target: {
        value: `# Horizon\n\nLié à [[mission:${missionIds.current}|la mission]].\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n\n\`\`\`python\nprint("ok")\n\`\`\``,
      },
    });
    expect(within(preview).getByRole("link", { name: "la mission" })).toHaveAttribute(
      "href",
      `/missions/${missionIds.current}`,
    );
    expect(await within(preview).findByRole("img", { name: "Diagramme" })).toContainHTML(
      "mermaid-svg",
    );
    expect(preview.querySelector("code.hljs")).not.toBeNull();
    expect(screen.getByText("Modifications non enregistrées")).toBeInTheDocument();

    // Autosave after a pause: a draft, not a version.
    await waitFor(() => expect(docs.lastUrl).toBe("draft"), { timeout: 3500 });
    expect(docs.lastBody).toEqual({ content_md: expect.stringContaining("la mission") });

    await user.click(screen.getByRole("button", { name: "ctrl-s" }));
    await waitFor(() =>
      expect(docs.lastBody).toEqual({
        title: "Architecture Horizon",
        content_md: expect.stringContaining("mermaid"),
      }),
    );
    expect(
      await screen.findByText("Toutes les modifications sont enregistrées"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Versions (2)" })).toBeInTheDocument();
  });

  it("shows broken diagrams as source", async () => {
    renderApp(`/documents/${docIds.root}`);
    const editor = await screen.findByRole("textbox", { name: "Contenu Markdown" });
    fireEvent.change(editor, { target: { value: "```mermaid\noops\n```" } });
    expect(
      await screen.findByText("Ce diagramme Mermaid ne peut pas être dessiné"),
    ).toBeInTheDocument();
  });

  it("offers to resume an unsaved draft", async () => {
    const user = userEvent.setup();
    const doc = docs.items.find((d) => d.id === docIds.root)!;
    Object.assign(doc, { draft_md: "# Brouillon", draft_saved_at: "2026-11-06T09:30:00Z" });
    renderApp(`/documents/${docIds.root}`);
    await user.click(await screen.findByRole("button", { name: "Reprendre le brouillon" }));
    expect(screen.getByRole("textbox", { name: "Contenu Markdown" })).toHaveValue("# Brouillon");

    Object.assign(doc, { draft_md: "# Autre", draft_saved_at: "2026-11-06T09:30:00Z" });
    renderApp(`/documents/${docIds.root}`);
    await user.click((await screen.findAllByRole("button", { name: "L'abandonner" })).at(-1)!);
    await waitFor(() => expect(docs.lastUrl).toBe("discard"));
  });

  it("uploads pasted images and inserts them as attachment links (P7-10)", async () => {
    const user = userEvent.setup();
    renderApp(`/documents/${docIds.root}`);
    await user.click(await screen.findByRole("button", { name: "paste-image" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Contenu Markdown" })).toHaveValue(
        `# Horizon![capture.png](attachment:${docs.uploads[0]!.id})`,
      ),
    );
    const image = within(screen.getByRole("region", { name: "Aperçu" })).getByRole("img", {
      name: "capture.png",
    });
    expect(image.getAttribute("src")).toMatch(
      new RegExp(`/api/v1/attachments/${docs.uploads[0]!.id}$`),
    );
  });

  it("exports as Markdown with labels, absolute links or SVG diagrams (P7-11)", async () => {
    const user = userEvent.setup();
    const doc = docs.items.find((d) => d.id === docIds.root)!;
    doc.content_md = `Voir [[mission:${missionIds.current}|la mission]].\n\n\`\`\`mermaid\nflowchart LR\n\`\`\`\n`;
    renderApp(`/documents/${docIds.root}`);
    await user.click(await screen.findByRole("button", { name: "Exporter" }));
    const dialog = await screen.findByRole("dialog", { name: "Copier en Markdown" });
    const result = within(dialog).getByRole("textbox", { name: "Markdown à coller" });
    await waitFor(() =>
      expect(result).toHaveValue(`Voir la mission.\n\n\`\`\`mermaid\nflowchart LR\n\`\`\`\n`),
    );

    await user.click(within(dialog).getByRole("radio", { name: "Liens vers l'application" }));
    await waitFor(() =>
      expect((result as HTMLTextAreaElement).value).toContain(
        `[la mission](http://localhost:3000/missions/${missionIds.current})`,
      ),
    );
    await user.click(within(dialog).getByRole("switch", { name: /Diagrammes en images SVG/ }));
    await waitFor(() =>
      expect((result as HTMLTextAreaElement).value).toContain("data:image/svg+xml;base64,"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Copier" }));
    expect(await navigator.clipboard.readText()).toContain("![diagram 1]");
  });

  it("attaches to entities, lists links and restores versions", async () => {
    const user = userEvent.setup();
    const doc = docs.items.find((d) => d.id === docIds.root)!;
    doc.versions.unshift({
      number: 2,
      title: "Architecture Horizon",
      content_md: "# V2",
      created_at: "2026-11-06T11:00:00Z",
    });
    doc.content_md = "# V2";
    doc.links = [
      { type: "mission", id: missionIds.current, label: "Horizon — Paiements" },
      { type: "domain", id: A, label: null },
    ];
    docs.backlinks = [
      { type: "document", id: docIds.root, documentId: docIds.child, label: "archi" },
    ];
    renderApp(`/documents/${docIds.root}`);

    const picker = await screen.findByRole("combobox", { name: "Rattacher à" });
    await user.type(picker, "Hori");
    await user.click(await screen.findByRole("option", { name: "Horizon — Paiements — Mission" }));
    await waitFor(() => expect(docs.lastUrl).toBe(`attach:mission:${missionIds.current}`));
    await user.click(
      await screen.findByRole("button", { name: "Détacher de Horizon — Paiements" }),
    );
    await waitFor(() => expect(docs.lastUrl).toBe(`detach:mission:${missionIds.current}`));

    await user.click(screen.getByRole("tab", { name: "Liens (2)" }));
    expect(screen.getByRole("link", { name: "Horizon — Paiements" })).toHaveAttribute(
      "href",
      `/missions/${missionIds.current}`,
    );
    expect(screen.getByText("introuvable ou inaccessible")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Rétroliens" }));
    expect(await screen.findByRole("link", { name: "Flux de paiement" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Versions (2)" }));
    await user.click(await screen.findByRole("button", { name: /^Version 1 —/ }));
    const dialog = await screen.findByRole("dialog", { name: "Version 1" });
    expect(await within(dialog).findByRole("heading", { name: "Horizon" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restaurer cette version" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Contenu Markdown" })).toHaveValue("# Horizon"),
    );
  });

  it("moves, archives and refuses to delete a page with sub-pages", async () => {
    const user = userEvent.setup();
    renderApp(`/documents/${docIds.child}`);
    expect(await screen.findByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument(); // breadcrumb
    await user.click(screen.getByRole("button", { name: "Archiver" }));
    await waitFor(() => expect(docs.lastUrl).toBe("archive"));
    expect(await screen.findByText("Ce document est archivé.")).toBeInTheDocument();
  });

  it("refuses to delete a page that has sub-pages", async () => {
    const user = userEvent.setup();
    renderApp(`/documents/${docIds.root}`);
    await screen.findByRole("textbox", { name: "Contenu Markdown" });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("dialog", { name: "Supprimer ?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirmer" }));
    expect(await screen.findByText(/encore utilisé/)).toBeInTheDocument();
  });

  it("manages document templates", async () => {
    const user = userEvent.setup();
    renderApp("/documents/templates");
    await user.click(
      await screen.findByRole("button", { name: "Modifier Compte rendu de réunion" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Modifier le modèle" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Contenu Markdown" }), {
      target: { value: "# CR" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(docs.lastBody).toEqual({
        name_fr: "Compte rendu de réunion",
        name_en: "Meeting notes",
        content_md: "# CR",
      }),
    );
  });

  it("lists a mission's documents and creates one attached to it", async () => {
    const user = userEvent.setup();
    docs.items.find((d) => d.id === docIds.child)!.entities = [
      { type: "mission", id: missionIds.current, label: "Horizon — Paiements" },
    ];
    docs.backlinks = [
      { type: "mission", id: missionIds.current, documentId: docIds.root, label: "x" },
    ];
    const { router } = renderApp(`/missions/${missionIds.current}?tab=documents`);
    expect(await screen.findByRole("link", { name: "Flux de paiement" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouveau document" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouveau document" });
    await user.type(within(dialog).getByRole("textbox", { name: "Titre" }), "Onboarding");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\//));
    expect(docs.lastBody).toMatchObject({ attach_to: { type: "mission", id: missionIds.current } });
  });

  it("redirects subject links to the subject's page", async () => {
    const { router } = renderApp("/subjects/subject-1");
    await waitFor(() => expect(router.state.location.search).toBe("?scope=TRAINING"));
    expect(router.state.location.pathname).toBe("/agenda/subjects");
  });
});
