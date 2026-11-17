import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDocument, docIds, docs } from "../../test/documentsBackend";
import { missionIds } from "../../test/missionsBackend";
import { addProject, projectIds, projects } from "../../test/projectsBackend";
import { renderApp } from "../../test/render";

type User = ReturnType<typeof userEvent.setup>;

async function pick(user: User, label: string, option: string | RegExp) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const dataTransfer = () => ({ setData: () => undefined, effectAllowed: "", dropEffect: "" });

function drag(source: HTMLElement, target: HTMLElement) {
  fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
  fireEvent.dragOver(target, { dataTransfer: dataTransfer() });
  fireEvent.drop(target, { dataTransfer: dataTransfer() });
}

/** The fake documents: "Architecture Horizon" > "Flux de paiement", filed in the project. */
function fileDocumentsInProject() {
  for (const document of docs.items) document.project_id = projectIds.current;
}

describe("projects (ADR-0042)", () => {
  it("lists a mission's projects and creates one, which becomes the work context", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/missions/${missionIds.current}?tab=projects`);
    expect(await screen.findByRole("link", { name: "Refonte des paiements" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Nouveau projet" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Nouveau projet" });
    await user.click(within(dialog).getByRole("button", { name: "Nouveau projet" }));
    expect(await within(dialog).findByText("Champ obligatoire")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "Cartes");
    await user.click(within(dialog).getByRole("button", { name: "Nouveau projet" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        new RegExp(`^/missions/${missionIds.current}/projects/`),
      ),
    );
    expect(projects.lastBody).toEqual({
      mission_id: missionIds.current,
      name: "Cartes",
      description: "",
    });
    expect(await screen.findByRole("heading", { name: "Cartes" })).toBeInTheDocument();
    // The navbar now shows the new project as the current context.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Projet courant" })).toHaveValue("Cartes"),
    );
  });

  it("shows the project's documents only and creates top-level pages in it", async () => {
    const user = userEvent.setup();
    fileDocumentsInProject();
    addDocument({ title: "Note hors projet" });
    const { router } = renderApp(`/missions/${missionIds.current}/projects/${projectIds.current}`);
    expect(await screen.findByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Flux de paiement" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Note hors projet" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nouveau document" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Titre" }), "Glossaire");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\//));
    expect(docs.lastBody).toMatchObject({ title: "Glossaire", project_id: projectIds.current });
  });

  it("renames, archives and deletes a project", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(
      `/missions/${missionIds.current}/projects/${projectIds.current}/about`,
    );
    expect(await screen.findByText("projet")).toBeInTheDocument(); // Markdown description
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifier" });
    const name = within(dialog).getByRole("textbox", { name: "Nom" });
    await user.clear(name);
    await user.type(name, "Paiements SEPA");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(projects.lastBody).toMatchObject({ name: "Paiements SEPA" }));

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    await waitFor(() => expect(projects.lastUrl).toBe("archive"));
    expect(await screen.findByText("Ce projet est archivé.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const confirm = await screen.findByRole("dialog", { name: "Supprimer le projet ?" });
    await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(projects.lastUrl).toBe(`delete:${projectIds.current}`));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/missions/${missionIds.current}`),
    );
  });
});

describe("work context and document tree (ADR-0042)", () => {
  it("scopes the documents page to the project picked in the navbar", async () => {
    const user = userEvent.setup();
    fileDocumentsInProject();
    addDocument({ title: "Note hors projet" });
    renderApp("/documents");
    // No context yet: every page, grouped by project.
    expect(await screen.findByRole("link", { name: "Note hors projet" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tous" })).toBeChecked();

    await pick(user, "Mission courante", "Horizon — Paiements");
    await pick(user, "Projet courant", "Refonte des paiements");
    expect(await screen.findByRole("radio", { name: "Projet courant" })).toBeChecked();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Note hors projet" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir le projet" })).toHaveAttribute(
      "href",
      `/missions/${missionIds.current}/projects/${projectIds.current}`,
    );

    await user.click(screen.getByRole("radio", { name: "Hors projet" }));
    expect(await screen.findByRole("link", { name: "Note hors projet" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Architecture Horizon" })).not.toBeInTheDocument();
  });

  it("sorts pages alphabetically at every level", async () => {
    addDocument({ title: "zèbre", parent_id: docIds.root });
    addDocument({ title: "Éléphant", parent_id: docIds.root });
    addDocument({ title: "Autruche" });
    renderApp("/documents");
    await screen.findByRole("link", { name: "zèbre" });
    const titles = screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((text) =>
        ["Autruche", "Architecture Horizon", "Éléphant", "Flux de paiement", "zèbre"].includes(
          text ?? "",
        ),
      );
    expect(titles).toEqual([
      "Architecture Horizon",
      "Éléphant",
      "Flux de paiement",
      "zèbre",
      "Autruche",
    ]);
  });

  it("nests a page by dropping it on another and takes it out on the top-level zone", async () => {
    fileDocumentsInProject();
    const other = addProject({ name: "Cartes" });
    const loose = addDocument({ title: "Carnet", project_id: other.id });
    addDocument({ title: "Bloc-notes", project_id: other.id });
    renderApp("/documents");
    await screen.findByRole("link", { name: "Carnet" });

    // Into "Architecture Horizon": the page joins its tree.
    drag(
      screen.getByTestId(`document-drag-${loose.id}`),
      screen.getByTestId(`document-row-${docIds.root}`),
    );
    await waitFor(() => expect(docs.lastBody).toEqual({ parent_id: docIds.root }));

    // Out of its parent to the top level of "Cartes".
    await waitFor(() =>
      expect(screen.getByTestId(`document-drag-${docIds.child}`)).toBeInTheDocument(),
    );
    fireEvent.dragStart(screen.getByTestId(`document-drag-${docIds.child}`), {
      dataTransfer: dataTransfer(),
    });
    const zone = await screen.findByTestId(`document-root-${other.id}`);
    fireEvent.dragOver(zone, { dataTransfer: dataTransfer() });
    fireEvent.drop(zone, { dataTransfer: dataTransfer() });
    await waitFor(() => expect(docs.lastBody).toEqual({ parent_id: null, project_id: other.id }));

    // A page cannot be dropped into its own subtree.
    docs.lastBody = null;
    drag(
      screen.getByTestId(`document-drag-${docIds.root}`),
      screen.getByTestId(`document-row-${loose.id}`),
    );
    expect(docs.lastBody).toBeNull();
  });
});
