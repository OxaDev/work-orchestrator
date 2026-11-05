import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { directory, ids } from "../../test/directoryBackend";
import { renderApp } from "../../test/render";
import { backend } from "../../test/server";

async function pickOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("directory navigation", () => {
  it("opens on contacts and switches sections", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/directory");
    expect(await screen.findByText("Hugo Lefèvre")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Technologies" }));
    expect(router.state.location.pathname).toBe("/directory/technologies");
    expect(await screen.findByText("Apache Kafka")).toBeInTheDocument();
  });
});

describe("contacts", () => {
  it("searches and opens a contact", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/directory/contacts");
    await user.type(await screen.findByRole("textbox", { name: "Rechercher" }), "zzz");
    expect(await screen.findByText("Aucun contact pour le moment.")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Rechercher" }));
    await user.click(await screen.findByRole("row", { name: "Hugo Lefèvre" }));
    expect(router.state.location.pathname).toBe(`/directory/contacts/${ids.hugo}`);
    expect(await screen.findByRole("heading", { name: "Hugo Lefèvre" })).toBeInTheDocument();
  });

  it("warns about duplicates and creates a contact", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/directory/contacts?new=1");
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Prénom"), "hugo");
    await user.type(within(dialog).getByLabelText("Nom"), "LEFEVRE");
    expect(
      await within(dialog).findByText("Des contacts similaires existent déjà"),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Nom"));
    await user.type(within(dialog).getByLabelText("Nom"), "Martin");
    await user.type(within(dialog).getByLabelText("E-mail professionnel"), "not-an-email");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(
      await within(dialog).findByText("Saisissez une adresse e-mail valide."),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("E-mail professionnel"));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/directory\/contacts\/.+/),
    );
    expect(directory.lastBody).toMatchObject({
      first_name: "hugo",
      last_name: "Martin",
      email_work: null,
    });
  });

  it("edits a contact, manages its history and archives it", async () => {
    const user = userEvent.setup();
    renderApp(`/directory/contacts/${ids.hugo}`);
    const title = (await screen.findAllByLabelText("Poste"))[0]!;
    await user.clear(title);
    await user.type(title, "CTO");
    await user.click(screen.getAllByRole("button", { name: "Enregistrer" })[0]!);
    await waitFor(() => expect(directory.lastBody).toMatchObject({ job_title: "CTO" }));

    const history = screen.getByText("Postes précédents").closest("div")!.parentElement!;
    await user.click(within(history).getByRole("button", { name: "Ajouter un poste" }));
    expect(await within(history).findByText("Obligatoire.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(await screen.findByText("Archivé")).toBeInTheDocument();
  });

  it("shows an error for an unknown contact", async () => {
    renderApp("/directory/contacts/unknown");
    expect(await screen.findByText("L'élément demandé n'existe pas.")).toBeInTheDocument();
  });
});

describe("companies", () => {
  it("filters by type and creates a company", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/directory/companies");
    expect(await screen.findByText("Banque Horizon")).toBeInTheDocument();
    await pickOption(user, "Type", "ESN");
    await waitFor(() => expect(screen.queryByText("Banque Horizon")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Nouvelle entreprise" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText("Obligatoire.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Nom"), "Atlas");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/directory\/companies\/.+/),
    );
    expect(directory.lastBody).toMatchObject({ name: "Atlas", types: ["CLIENT"], website: null });
  });

  it("reports a duplicate company name", async () => {
    const user = userEvent.setup();
    renderApp("/directory/companies");
    await user.click(await screen.findByRole("button", { name: "Nouvelle entreprise" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "banque horizon");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Ce nom est déjà utilisé.")).toBeInTheDocument();
  });

  it("shows a company with notes, organisation and contacts", async () => {
    const user = userEvent.setup();
    renderApp(`/directory/companies/${ids.bankCompany}`);
    expect(await screen.findByRole("heading", { name: "Banque Horizon" })).toBeInTheDocument();
    expect(screen.getByText("Client historique").tagName).toBe("STRONG");

    await user.click(screen.getByRole("tab", { name: "Organisation" }));
    const tree = await screen.findByRole("tree", { name: "Organisation" });
    expect(
      within(tree)
        .getAllByRole("treeitem")
        .map((n) => n.getAttribute("aria-level")),
    ).toEqual(["1", "2"]);

    await user.click(within(tree).getByRole("button", { name: "Supprimer DSI" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    expect(await screen.findByText(/encore utilisé/)).toBeInTheDocument();

    await user.click(
      within(tree).getByRole("button", { name: "Ajouter une unité sous Paiements" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "Cartes");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(tree).findByText("Cartes")).toBeInTheDocument();
    expect(directory.lastBody).toMatchObject({ name: "Cartes", parent_id: ids.payments });

    await user.click(screen.getByRole("tab", { name: "Contacts (1)" }));
    expect(await screen.findByRole("row", { name: "Hugo Lefèvre" })).toBeInTheDocument();
  });

  it("saves and archives a company", async () => {
    const user = userEvent.setup();
    renderApp(`/directory/companies/${ids.bankCompany}`);
    const website = await screen.findByLabelText("Site web");
    await user.type(website, "https://horizon.example");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(directory.lastBody).toMatchObject({ website: "https://horizon.example" }),
    );
    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(await screen.findByRole("button", { name: "Restaurer" })).toBeInTheDocument();
  });
});

describe("technologies", () => {
  it("searches by alias and filters by category", async () => {
    const user = userEvent.setup();
    renderApp("/directory/technologies");
    await user.type(await screen.findByRole("textbox", { name: "Rechercher" }), "kafka");
    await waitFor(() => expect(screen.queryByText("Python")).not.toBeInTheDocument());
    await user.clear(screen.getByRole("textbox", { name: "Rechercher" }));
    await pickOption(user, "Catégorie", "Langage");
    await waitFor(() => expect(screen.queryByText("Apache Kafka")).not.toBeInTheDocument());
  });

  it("creates, edits and archives a technology", async () => {
    const user = userEvent.setup();
    renderApp("/directory/technologies");
    await user.click(await screen.findByRole("button", { name: "Nouvelle technologie" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "Rust");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Rust")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Modifier Python" }));
    dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Description"), "Langage polyvalent");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(directory.lastBody).toMatchObject({ description: "Langage polyvalent" }),
    );

    await user.click(screen.getByRole("button", { name: "Archiver Python" }));
    await waitFor(() => expect(screen.queryByText("Python")).not.toBeInTheDocument());
    await user.click(screen.getByLabelText("Afficher les archivés"));
    await user.click(await screen.findByRole("button", { name: "Restaurer Python" }));
    await waitFor(() => expect(directory.technologies[0]!.archived_at).toBeNull());
  });
});

describe("sectors", () => {
  it("shows the tree, adds a sub-sector and explains refused deletions", async () => {
    const user = userEvent.setup();
    renderApp("/directory/sectors");
    const tree = await screen.findByRole("tree", { name: "Secteurs" });
    expect(within(tree).getByText("1 entreprise")).toBeInTheDocument();

    await user.click(
      within(tree).getByRole("button", { name: "Ajouter un sous-secteur à Finance" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom (français)"), "Paiement");
    await user.type(within(dialog).getByLabelText("Nom (anglais)"), "Payments");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(tree).findByText("Paiement")).toBeInTheDocument();
    expect(directory.lastBody).toMatchObject({ parent_id: ids.finance });

    await user.click(within(tree).getByRole("button", { name: "Supprimer Finance" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    expect(await screen.findByText(/encore utilisé/)).toBeInTheDocument();
  });

  it("edits a sector without allowing a cycle", async () => {
    const user = userEvent.setup();
    renderApp("/directory/sectors");
    const tree = await screen.findByRole("tree", { name: "Secteurs" });
    await user.click(within(tree).getByRole("button", { name: "Modifier Finance" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Secteur parent" }));
    expect(screen.queryByRole("option", { name: /Banque/ })).not.toBeInTheDocument();
  });
});

describe("tags", () => {
  it("creates, recolours and deletes a tag", async () => {
    const user = userEvent.setup();
    renderApp("/directory/tags");
    await user.click(await screen.findByRole("button", { name: "Nouveau tag" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "Legacy");
    await user.click(within(dialog).getByRole("radio", { name: "orange" }));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Legacy")).toBeInTheDocument();
    expect(directory.lastBody).toEqual({ name: "Legacy", color: "orange" });

    await user.click(screen.getByRole("button", { name: "Modifier Critique" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "teal" }));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(directory.lastBody).toMatchObject({ color: "teal" }));

    await user.click(screen.getByRole("button", { name: "Supprimer Critique" }));
    expect(await screen.findByText(/Il sera retiré de 1 élément/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(screen.queryByText("Critique")).not.toBeInTheDocument());
  });
});

describe("profile", () => {
  it("stores the employer consulting firm", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await pickOption(user, "Mon ESN", "Néo Consulting");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(backend.lastPatch).toMatchObject({ employer_company_id: ids.esn }));
  });
});
