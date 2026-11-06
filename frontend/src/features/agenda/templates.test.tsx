import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { agenda } from "../../test/agendaBackend";
import { missionIds } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";
import { addTemplate, templates } from "../../test/templatesBackend";
import type { TemplateSlot } from "./templatesApi";

type User = ReturnType<typeof userEvent.setup>;

async function pick(user: User, label: string, option: string, scope?: HTMLElement) {
  const root = scope ? within(scope) : screen;
  await user.click(await root.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** 3 days on site, 2 remote, without a mission of their own. */
const threeTwo: TemplateSlot[] = [0, 1, 2, 3, 4].flatMap((weekday) =>
  (["AM", "PM"] as const).map((period) => ({
    weekday,
    period,
    kind: "MISSION" as const,
    mission_id: null,
    subtype_id: null,
    location: weekday < 3 ? ("CLIENT_ON_SITE" as const) : ("REMOTE_HOME" as const),
  })),
);

describe("week template editor (P6-6)", () => {
  it("creates a template, fills its 7 × 2 grid and saves it", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/templates");
    expect(await screen.findByText("Aucune semaine type pour l'instant.")).toBeInTheDocument();
    // Empty list: the header button and the empty-state one do the same.
    await user.click(screen.getAllByRole("button", { name: "Nouvelle semaine type" })[0]!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText("Obligatoire.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "3/2 Horizon");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    const grid = await screen.findByRole("grid", { name: "Semaine type" });
    for (const name of ["lundi, matin", "lundi, après-midi", "mardi, matin"]) {
      await user.click(within(grid).getByRole("button", { name: `${name} : Non saisi` }));
    }
    expect(screen.getByText("3 demi-journées sélectionnées")).toBeInTheDocument();
    await pick(user, "Lieu de travail", "Sur site chez le client");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(
      within(grid).getByRole("button", {
        name: "lundi, matin : Mission par défaut · Sur site chez le client",
      }),
    ).toBeInTheDocument();

    await user.click(within(grid).getByRole("button", { name: "samedi, matin : Non saisi" }));
    await pick(user, "Nature", "Non travaillé");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await user.click(within(grid).getByRole("button", { name: "samedi, matin : Non travaillé" }));
    await user.click(screen.getByRole("button", { name: "Vider" }));

    await pick(user, "Mission par défaut", "Horizon — Paiements");
    await user.click(screen.getByRole("button", { name: "Enregistrer la semaine type" }));
    await waitFor(() =>
      expect(templates.lastBody).toEqual({
        name: "3/2 Horizon",
        description: "",
        mission_id: missionIds.current,
        slots: [
          {
            weekday: 0,
            period: "AM",
            kind: "MISSION",
            mission_id: null,
            subtype_id: null,
            location: "CLIENT_ON_SITE",
          },
          {
            weekday: 0,
            period: "PM",
            kind: "MISSION",
            mission_id: null,
            subtype_id: null,
            location: "CLIENT_ON_SITE",
          },
          {
            weekday: 1,
            period: "AM",
            kind: "MISSION",
            mission_id: null,
            subtype_id: null,
            location: "CLIENT_ON_SITE",
          },
        ],
      }),
    );
    await user.click(screen.getByRole("link", { name: "Semaines types" }));
    expect(await screen.findByText("3 demi-journées")).toBeInTheDocument();
  });

  it("duplicates and deletes templates", async () => {
    const user = userEvent.setup();
    addTemplate({ name: "3/2", slots: threeTwo });
    renderApp("/agenda/templates");
    await user.click(await screen.findByRole("button", { name: "Dupliquer 3/2" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Nom" })).toHaveValue("3/2 (copie)");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("3/2 (copie)")).toBeInTheDocument();
    expect(templates.lastBody).toEqual({ name: "3/2 (copie)" });

    await user.click(screen.getByRole("button", { name: "Supprimer 3/2 (copie)" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(screen.queryByText("3/2 (copie)")).not.toBeInTheDocument());
  });
});

describe("applying a week template (P6-3, P6-4, P6-5, P6-7)", () => {
  it("fills a mission month in three clicks from the month view, keeping filled days", async () => {
    const user = userEvent.setup();
    addTemplate({ name: "3/2", mission_id: missionIds.current, slots: threeTwo });
    renderApp("/agenda/2026/11");

    // 1: the template of the mission running this month is proposed.
    await user.click(await screen.findByRole("button", { name: "Appliquer « 3/2 »" }));
    const dialog = await screen.findByRole("dialog", { name: "Appliquer une semaine type" });
    // 2: preview.
    await user.click(within(dialog).getByRole("button", { name: "Prévisualiser" }));
    // 21 weekdays; 11 November is a public holiday already in the agenda (RG-10).
    expect(await within(dialog).findByText("Remplies : 40")).toBeInTheDocument();
    expect(within(dialog).getByText("Conservées (déjà saisies) : 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", {
        name: "lundi 2 novembre, matin : Remplies — Horizon — Paiements · Sur site chez le client",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: /mercredi 11 novembre, matin : Conservées/ }),
    ).toBeInTheDocument();
    // 3: apply.
    await user.click(within(dialog).getByRole("button", { name: "Appliquer (40 demi-journées)" }));
    await waitFor(() =>
      expect(templates.lastBody).toEqual({
        start: "2026-11-01",
        end: "2026-11-30",
        strategy: "SKIP",
        mission_id: missionIds.current,
      }),
    );
    expect(templates.lastUrl).toBe("apply");
    expect(await screen.findByText("40 demi-journées remplies.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "lundi 2 novembre, matin : Horizon — Paiements" }),
    ).toBeInTheDocument();
  });

  it("asks for the mission, previews again after a change and confirms before overwriting", async () => {
    const user = userEvent.setup();
    addTemplate({ name: "3/2", slots: threeTwo });
    for (const period of ["AM", "PM"] as const) {
      agenda.halfDays.set(`2026-11-02|${period}`, {
        date: "2026-11-02",
        period,
        kind: "INTERCONTRACT",
        mission_id: null,
        subtype_id: null,
        location: null,
        note: null,
      });
    }
    renderApp("/agenda/templates");
    await user.click(await screen.findByRole("button", { name: "Appliquer 3/2" }));
    const dialog = await screen.findByRole("dialog", { name: "Appliquer une semaine type" });
    fireEvent.change(within(dialog).getByLabelText("Du"), { target: { value: "2026-11-02" } });
    fireEvent.change(within(dialog).getByLabelText("Au"), { target: { value: "2026-11-03" } });

    await user.click(within(dialog).getByRole("button", { name: "Prévisualiser" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Choisissez la mission des demi-journées mission de la semaine type.",
    );
    await pick(user, "Mission", "Horizon — Paiements", dialog);
    await user.click(within(dialog).getByRole("switch", { name: /Remplacer les demi-journées/ }));
    await user.click(within(dialog).getByRole("button", { name: "Prévisualiser" }));
    expect(await within(dialog).findByText("Remplacées : 2")).toBeInTheDocument();
    expect(within(dialog).getByText("Remplies : 2")).toBeInTheDocument();

    // Any change invalidates the preview.
    fireEvent.change(within(dialog).getByLabelText("Au"), { target: { value: "2026-11-04" } });
    expect(within(dialog).queryByText("Remplacées : 2")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^Appliquer \(/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Prévisualiser" }));

    await user.click(
      await within(dialog).findByRole("button", { name: "Appliquer (6 demi-journées)" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Remplacer des demi-journées saisies ?",
    });
    expect(confirm).toHaveTextContent("2 demi-journée(s) déjà saisie(s) seront remplacées.");
    await user.click(within(confirm).getByRole("button", { name: "Confirmer" }));
    await waitFor(() =>
      expect(templates.lastBody).toEqual({
        start: "2026-11-02",
        end: "2026-11-04",
        strategy: "OVERWRITE",
        mission_id: missionIds.current,
      }),
    );
    expect(agenda.halfDays.get("2026-11-02|AM")?.kind).toBe("MISSION");
  });

  it("proposes the template edited last when several missions run in the month", async () => {
    addTemplate({
      name: "Ancien",
      mission_id: missionIds.current,
      slots: threeTwo,
      updated_at: "2026-10-01T10:00:00Z",
    });
    addTemplate({
      name: "Récent",
      mission_id: missionIds.current,
      slots: threeTwo,
      updated_at: "2026-11-04T10:00:00Z",
    });
    renderApp("/agenda/2026/11");
    expect(await screen.findByRole("button", { name: "Appliquer « Récent »" })).toBeInTheDocument();
  });

  it("proposes the mission's template on the mission page only when there is one", async () => {
    renderApp(`/missions/${missionIds.current}`);
    await screen.findByRole("heading", { name: "Horizon — Paiements" });
    expect(screen.queryByRole("button", { name: /Appliquer « / })).not.toBeInTheDocument();

    addTemplate({ name: "3/2", mission_id: missionIds.current, slots: threeTwo });
    const user = userEvent.setup();
    renderApp(`/missions/${missionIds.current}`);
    await user.click((await screen.findAllByRole("button", { name: "Appliquer « 3/2 »" }))[0]!);
    expect(
      await screen.findByRole("dialog", { name: "Appliquer une semaine type" }),
    ).toBeInTheDocument();
  });
});
