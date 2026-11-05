import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ids } from "../../test/directoryBackend";
import { missionIds, missions } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";
import { backend } from "../../test/server";
import { formatDate } from "./format";

type User = ReturnType<typeof userEvent.setup>;

/** Typing into <input type="date"> is unreliable in jsdom: set the value directly. */
const setDate = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

async function pick(user: User, scope: HTMLElement | null, label: string, option: string) {
  const queries = scope ? within(scope) : screen;
  await user.click(await queries.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("formatDate", () => {
  it("formats calendar dates without time zone drift", () => {
    expect(formatDate("2026-01-05", "fr")).toBe("5 janv. 2026");
    expect(formatDate(null, "fr")).toBe("");
  });
});

describe("missions list", () => {
  it("shows cards and filters by status", async () => {
    const user = userEvent.setup();
    renderApp("/missions");
    const card = await screen.findByRole("link", { name: "Horizon — Paiements" });
    expect(within(card).getByText("Tech lead · Banque Horizon")).toBeInTheDocument();
    expect(within(card).getByText("Prospect")).toBeInTheDocument();
    await user.click(screen.getByText("Terminée"));
    expect(await screen.findByText("Aucune mission pour le moment.")).toBeInTheDocument();
  });

  it("creates a mission step by step with the ESN from the profile", async () => {
    backend.session!.employer_company_id = ids.esn;
    const user = userEvent.setup();
    const { router } = renderApp("/missions");
    await user.click(await screen.findByRole("button", { name: "Nouvelle mission" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    expect(within(dialog).getByText("Obligatoire.")).toBeInTheDocument();
    await pick(user, dialog, "Client", "Banque Horizon");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));

    await user.type(within(dialog).getByLabelText("Intitulé de poste"), "Architecte");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    await user.click(within(dialog).getByRole("button", { name: "Retour" }));
    expect(within(dialog).getByLabelText("Nom interne")).toHaveValue("Banque Horizon — Architecte");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));

    setDate(within(dialog).getByLabelText("Date de début"), "2026-03-01");
    setDate(within(dialog).getByLabelText("Date de fin prévue"), "2026-02-01");
    await user.click(within(dialog).getByRole("button", { name: "Nouvelle mission" }));
    expect(
      within(dialog).getByText("La date de fin est antérieure à la date de début."),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Date de fin prévue"));
    await user.click(within(dialog).getByRole("button", { name: "Nouvelle mission" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/missions\/.+/));
    expect(missions.lastBody).toMatchObject({
      client_id: ids.bankCompany,
      employer_company_id: ids.esn,
      job_title: "Architecte",
      title: "Banque Horizon — Architecte",
      start_date: "2026-03-01",
      planned_end_date: null,
    });
  });

  it("requires an ESN when the profile has none", async () => {
    const user = userEvent.setup();
    renderApp("/missions");
    await user.click(await screen.findByRole("button", { name: "Nouvelle mission" }));
    const dialog = await screen.findByRole("dialog");
    await pick(user, dialog, "Client", "Banque Horizon");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    expect(within(dialog).getByText("Obligatoire.")).toBeInTheDocument();
    await pick(user, dialog, "ESN", "Néo Consulting");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    expect(await within(dialog).findByLabelText("Intitulé de poste")).toBeInTheDocument();
  });

  it("shows the API error when creation fails", async () => {
    missions.employerId = null;
    backend.session!.employer_company_id = null;
    const user = userEvent.setup();
    renderApp("/missions");
    await user.click(await screen.findByRole("button", { name: "Nouvelle mission" }));
    const dialog = await screen.findByRole("dialog");
    await pick(user, dialog, "Client", "Banque Horizon");
    await pick(user, dialog, "ESN", "Néo Consulting");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    await user.type(within(dialog).getByLabelText("Intitulé de poste"), "Dev");
    await user.click(within(dialog).getByRole("button", { name: "Suivant" }));
    setDate(within(dialog).getByLabelText("Date de début"), "2026-03-01");
    // Simulate the server refusing the ESN chosen (e.g. deleted meanwhile).
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("../../test/server");
    server.use(
      http.post("*/api/v1/missions", () =>
        HttpResponse.json(
          { code: "MISSION_EMPLOYER_REQUIRED", detail: "", params: {} },
          { status: 422 },
        ),
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Nouvelle mission" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choisissez l'ESN");
  });
});

describe("mission page", () => {
  const url = () => `/missions/${missionIds.current}`;

  it("shows the header and applies the suggested status", async () => {
    const user = userEvent.setup();
    renderApp(url());
    expect(await screen.findByRole("heading", { name: "Horizon — Paiements" })).toBeInTheDocument();
    expect(screen.getByText("via Néo Consulting", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/semble « En cours »/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(missions.lastBody).toEqual({ status: "ACTIVE" }));
    await waitFor(() => expect(screen.queryByText(/semble/)).not.toBeInTheDocument());
  });

  it("edits the mission and records the reason of a new end date", async () => {
    const user = userEvent.setup();
    renderApp(url());
    expect(await screen.findByText("Kafka", { selector: "strong" })).toBeInTheDocument();
    const end = screen.getByLabelText("Date de fin prévue");
    await user.clear(end);
    await user.type(end, "2027-06-30");
    await user.type(screen.getByLabelText("Motif de la nouvelle date de fin"), "Avenant 2");
    await user.click(screen.getByRole("radio", { name: "grape" }));
    await user.click(screen.getByLabelText("Afficher les données financières"));
    await user.type(screen.getByLabelText("TJM"), "650");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(missions.lastBody).toMatchObject({
        planned_end_date: "2027-06-30",
        end_date_change_note: "Avenant 2",
        color: "grape",
        daily_rate: "650",
      }),
    );
    await user.click(screen.getByRole("tab", { name: "Historique" }));
    expect(await screen.findByText(/Avenant 2/)).toBeInTheDocument();
  });

  it("manages contacts with roles", async () => {
    const user = userEvent.setup();
    renderApp(url());
    await user.click(await screen.findByRole("tab", { name: "Contacts (1)" }));
    expect(screen.getByRole("link", { name: "Hugo Lefèvre" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer Hugo Lefèvre" }));
    expect(await screen.findByText("Aucun contact lié pour le moment.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(screen.getByText("Obligatoire.")).toBeInTheDocument();
    await pick(user, null, "Ajouter un contact", "Hugo Lefèvre — Banque Horizon");
    await pick(user, null, "Rôle", "Manager");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByRole("link", { name: "Hugo Lefèvre" })).toBeInTheDocument();
    expect(missions.lastBody).toEqual({ role_id: missionIds.manager });
  });

  it("weights technologies", async () => {
    const user = userEvent.setup();
    renderApp(url());
    await user.click(await screen.findByRole("tab", { name: "Technologies (1)" }));
    expect(screen.getByText("Langage")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer Python" }));
    expect(await screen.findByText("Aucune technologie pour le moment.")).toBeInTheDocument();
    await pick(user, null, "Ajouter une technologie", "Apache Kafka");
    await user.type(screen.getByLabelText("Version"), "3.7");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(missions.lastBody).toEqual({ weight: 3, version: "3.7" }));
    expect(await within(screen.getByRole("table")).findByText("Apache Kafka")).toBeInTheDocument();
  });

  it("refuses to delete a referenced mission, archives it instead", async () => {
    const user = userEvent.setup();
    renderApp(url());
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    expect(await screen.findByText(/encore utilisé/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(await screen.findByRole("button", { name: "Restaurer" })).toBeInTheDocument();
  });

  it("deletes an unreferenced mission", async () => {
    const extra = { ...missions.items[0]!, id: "extra-mission", title: "À supprimer" };
    missions.items.push(extra);
    const user = userEvent.setup();
    const { router } = renderApp("/missions/extra-mission");
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/missions"));
  });

  it("reports an unknown mission", async () => {
    renderApp("/missions/unknown");
    expect(await screen.findByText("L'élément demandé n'existe pas.")).toBeInTheDocument();
  });
});

describe("contact roles", () => {
  it("creates a role and refuses to delete a used one", async () => {
    const user = userEvent.setup();
    renderApp("/directory/roles");
    await user.click(await screen.findByRole("button", { name: "Nouveau rôle" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom (français)"), "Sponsor");
    await user.type(within(dialog).getByLabelText("Nom (anglais)"), "Sponsor");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findAllByRole("cell", { name: "Sponsor" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Supprimer Manager" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    expect((await screen.findAllByText(/encore utilisé/)).length).toBeGreaterThan(0);
  });

  it("renames a role", async () => {
    const user = userEvent.setup();
    renderApp("/directory/roles");
    await user.click(await screen.findByRole("button", { name: "Modifier Manager" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Nom (anglais)"));
    await user.type(within(dialog).getByLabelText("Nom (anglais)"), "Line manager");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(missions.lastBody).toMatchObject({ name_en: "Line manager" }));
  });
});

describe("company missions tab", () => {
  it("lists the missions held at a client", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/directory/companies/${ids.bankCompany}`);
    await user.click(await screen.findByRole("tab", { name: "Missions" }));
    await user.click(await screen.findByRole("row", { name: "Horizon — Paiements" }));
    expect(router.state.location.pathname).toBe(`/missions/${missionIds.current}`);
  });
});
