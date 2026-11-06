import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { data } from "../../test/dataBackend";
import { renderApp } from "../../test/render";

vi.mock("../documents/MarkdownEditor", () => ({ MarkdownEditor: () => null }));

const file = (name: string, type = "application/zip") => new File([name], name, { type });

function fileInput(container: HTMLElement = document.body): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  return input;
}

beforeEach(() => {
  // jsdom has no object URLs; downloads go through a temporary link.
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings > data (P11-4, P11-5, ADR-0040)", () => {
  it("downloads the archive", async () => {
    const user = userEvent.setup();
    renderApp("/settings/data");
    expect(await screen.findByRole("tab", { name: "Données", selected: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Télécharger l'archive" }));
    await waitFor(() => expect(data.exports).toBe(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("imports an archive after confirmation and summarises it", async () => {
    const user = userEvent.setup();
    renderApp("/settings/data");
    const button = await screen.findByRole("button", { name: "Importer" });
    expect(button).toBeDisabled();
    await user.upload(fileInput(), file("export.zip"));
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Importer cette archive ?" });
    await user.click(within(dialog).getByRole("button", { name: "Importer" }));
    expect(await screen.findByText("Archive importée")).toBeInTheDocument();
    expect(data.imported).toEqual(["export.zip"]);
    const summary = screen.getByRole("table");
    expect(within(summary).getByText("Missions")).toBeInTheDocument();
    expect(within(summary).getByText("5")).toBeInTheDocument(); // documents
    expect(within(summary).queryByText("Tâches")).not.toBeInTheDocument(); // none imported
    expect(screen.getByText("1 fichier manquait dans l'archive.")).toBeInTheDocument();
  });

  it("explains why an import is refused", async () => {
    const user = userEvent.setup();
    renderApp("/settings/data");
    await screen.findByText("Importer une archive");
    await user.upload(fileInput(), file("full.zip"));
    await user.click(screen.getByRole("button", { name: "Importer" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Importer" }),
    );
    expect(await screen.findByText(/Ce compte contient déjà des données/)).toBeInTheDocument();
  });
});

describe("Markdown import (P11-6)", () => {
  it("imports a zipped vault from the documents page", async () => {
    const user = userEvent.setup();
    renderApp("/documents");
    await user.click(await screen.findByRole("button", { name: "Importer du Markdown" }));
    const dialog = await screen.findByRole("dialog", { name: "Importer du Markdown" });
    await user.upload(fileInput(dialog), file("vault.zip"));
    await user.click(within(dialog).getByRole("button", { name: "Importer" }));
    expect(await within(dialog).findByText("12 documents")).toBeInTheDocument();
    expect(within(dialog).getByText("2 pages de dossier")).toBeInTheDocument();
    expect(
      within(dialog).getByText("1 lien vers une note absente laissé tel quel"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Importer" })).not.toBeInTheDocument();
  });

  it("shows the error of an invalid file", async () => {
    const user = userEvent.setup();
    renderApp("/documents");
    await user.click(await screen.findByRole("button", { name: "Importer du Markdown" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(fileInput(dialog), file("notes.txt"));
    await user.click(within(dialog).getByRole("button", { name: "Importer" }));
    expect(await within(dialog).findByText(/pas une archive valide \(zip\)/)).toBeInTheDocument();
  });
});

describe("contacts CSV (P11-7)", () => {
  it("previews with a dry run, then imports", async () => {
    const user = userEvent.setup();
    renderApp("/directory/contacts");
    await user.click(await screen.findByRole("button", { name: "Importer un CSV" }));
    const dialog = await screen.findByRole("dialog", { name: "Importer un CSV" });
    await user.upload(fileInput(dialog), file("contacts.csv", "text/csv"));
    expect(
      await within(dialog).findByText("2 à créer, 1 déjà connus, 1 nouvelles entreprises."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("1 ligne refusée")).toBeInTheDocument();
    expect(within(dialog).getByText("Ligne 4")).toBeInTheDocument();
    expect(within(dialog).getByText("E-mail pro")).toBeInTheDocument();
    expect(within(dialog).getByText("E-mail invalide")).toBeInTheDocument();
    expect(data.csvRuns).toEqual([true]);

    await user.click(within(dialog).getByRole("button", { name: "Importer 2 contacts" }));
    expect(await screen.findByText("2 contacts importés.")).toBeInTheDocument();
    expect(data.csvRuns).toEqual([true, false]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cannot import when nothing would be created, and exports", async () => {
    data.csvReport = { created: 0, skipped: 3, companies_created: 0, errors: [] };
    const user = userEvent.setup();
    renderApp("/directory/contacts");
    await user.click(await screen.findByRole("button", { name: "Exporter en CSV" }));
    await waitFor(() => expect(data.exports).toBe(1));
    await user.click(screen.getByRole("button", { name: "Importer un CSV" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(fileInput(dialog), file("contacts.csv", "text/csv"));
    await within(dialog).findByText(/0 à créer/);
    expect(within(dialog).getByRole("button", { name: "Importer 0 contact" })).toBeDisabled();
  });
});
