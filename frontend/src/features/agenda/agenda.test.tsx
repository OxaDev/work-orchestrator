import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { agenda, agendaIds } from "../../test/agendaBackend";
import { missionIds } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";
import { backend } from "../../test/server";
import {
  addDays,
  isWeekend,
  monthWeeks,
  parseYearMonth,
  slotRange,
  todayIso,
  weekdayIndex,
} from "./calendar";
import { halfDayBackground } from "./kinds";

type User = ReturnType<typeof userEvent.setup>;

async function pick(user: User, label: string, option: string) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const cell = (name: string | RegExp) => screen.findByRole("button", { name });

function fillMonth(year: number, month: number, except: string[] = []) {
  const holidays = ["2026-11-11"];
  for (let day = 1; day <= new Date(Date.UTC(year, month, 0)).getUTCDate(); day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isWeekend(date) || holidays.includes(date) || except.includes(date)) continue;
    for (const period of ["AM", "PM"] as const) {
      agenda.halfDays.set(`${date}|${period}`, {
        date,
        period,
        kind: "INTERCONTRACT",
        mission_id: null,
        subtype_id: null,
        location: null,
        note: null,
      });
    }
  }
}

describe("calendar helpers", () => {
  it("builds Monday-first weeks covering the month", () => {
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0]![0]).toBe("2026-10-26");
    expect(weeks.at(-1)![6]).toBe("2026-12-06");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles days, weekends and ranges", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayIndex("2026-11-02")).toBe(0);
    expect(isWeekend("2026-11-01")).toBe(true);
    expect(
      slotRange({ date: "2026-11-03", period: "AM" }, { date: "2026-11-02", period: "PM" }),
    ).toEqual([
      { date: "2026-11-02", period: "PM" },
      { date: "2026-11-03", period: "AM" },
    ]);
    expect(todayIso(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("validates route params", () => {
    expect(parseYearMonth("2026", "11")).toEqual({ year: 2026, month: 11 });
    expect(parseYearMonth("2026")).toEqual({ year: 2026, month: 1 });
    expect(parseYearMonth("abc", "1")).toBeNull();
    expect(parseYearMonth("2026", "13")).toBeNull();
  });

  it("encodes kinds with colour and pattern", () => {
    expect(halfDayBackground("MISSION", "teal")).toBe("var(--mantine-color-teal-5)");
    expect(halfDayBackground("LEAVE")).toContain("repeating-linear-gradient");
    expect(halfDayBackground("PUBLIC_HOLIDAY")).toContain("radial-gradient");
    expect(halfDayBackground("SICK_LEAVE")).not.toBe(halfDayBackground("OFF"));
  });
});

describe("month view", () => {
  it("redirects /agenda to the current month", async () => {
    const { router } = renderApp("/agenda");
    const today = todayIso();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/agenda/${today.slice(0, 4)}/${Number(today.slice(5, 7))}`,
      ),
    );
  });

  it("pre-fills public holidays once and shows them", async () => {
    renderApp("/agenda/2026/11");
    expect(await cell(/mercredi 11 novembre, matin : Jour férié/)).toBeInTheDocument();
    expect(screen.getAllByText("Armistice").length).toBeGreaterThan(0);
    expect(agenda.generated).toEqual([2026]);
  });

  it("selects with click and shift-click, then assigns a mission", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    await user.click(await cell(/lundi 2 novembre, matin : Non saisi/));
    await user.keyboard("{Shift>}");
    await user.click(await cell(/mardi 3 novembre, après-midi : Non saisi/));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("4 demi-journées sélectionnées")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Appliquer" })).toBeDisabled();
    await pick(user, "Mission", "Horizon — Paiements");
    await pick(user, "Lieu de travail", "Télétravail depuis la maison");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await waitFor(() =>
      expect(agenda.lastBody).toMatchObject({
        kind: "MISSION",
        mission_id: missionIds.current,
        location: "REMOTE_HOME",
        slots: [
          { date: "2026-11-02", period: "AM" },
          { date: "2026-11-02", period: "PM" },
          { date: "2026-11-03", period: "AM" },
          { date: "2026-11-03", period: "PM" },
        ],
      }),
    );
    expect(await cell(/lundi 2 novembre, matin : Horizon — Paiements/)).toBeInTheDocument();
    expect(screen.getByText(/Cliquez, glissez/)).toBeInTheDocument();
  });

  it("selects by dragging, by whole day and with the keyboard", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    const start = await cell(/jeudi 5 novembre, matin/);
    const end = await cell(/jeudi 5 novembre, après-midi/);
    await user.pointer([
      { keys: "[MouseLeft>]", target: start },
      { target: end },
      { keys: "[/MouseLeft]" },
    ]);
    expect(screen.getByText("2 demi-journées sélectionnées")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sélectionner le vendredi 6 novembre" }));
    expect(screen.getByText("4 demi-journées sélectionnées")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sélectionner le vendredi 6 novembre" }));
    expect(screen.getByText("2 demi-journées sélectionnées")).toBeInTheDocument();

    (await cell(/lundi 9 novembre, matin/)).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("3 demi-journées sélectionnées")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Désélectionner" }));
    expect(screen.getByText(/Cliquez, glissez/)).toBeInTheDocument();
  });

  it("records leave with a detail, without place of work", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    await user.click(await cell(/lundi 16 novembre, matin/));
    await pick(user, "Nature", "Congés");
    expect(screen.queryByRole("combobox", { name: "Lieu de travail" })).not.toBeInTheDocument();
    await pick(user, "Précision", "Congés payés");
    await user.type(screen.getByLabelText("Note"), "Pont");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await waitFor(() =>
      expect(agenda.lastBody).toMatchObject({
        kind: "LEAVE",
        subtype_id: agendaIds.paidLeave,
        mission_id: null,
        location: null,
        note: "Pont",
      }),
    );
  });

  it("links a mission half-day to its mission and empties half-days", async () => {
    agenda.halfDays.set("2026-11-17|AM", {
      date: "2026-11-17",
      period: "AM",
      kind: "MISSION",
      mission_id: missionIds.current,
      subtype_id: null,
      location: null,
      note: null,
    });
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    await user.click(await cell(/mardi 17 novembre, matin : Horizon — Paiements/));
    expect(
      screen.getByRole("link", { name: "Ouvrir la mission « Horizon — Paiements »" }),
    ).toHaveAttribute("href", `/missions/${missionIds.current}`);
    await user.click(screen.getByRole("button", { name: "Vider" }));
    expect(await cell(/mardi 17 novembre, matin : Non saisi/)).toBeInTheDocument();
  });

  it("refuses to validate an incomplete month", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    await user.click(await screen.findByRole("button", { name: "Valider le mois" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/demi-journées sont encore vides/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Valider" })).toBeDisabled();
  });

  it("validates a complete month, freezes it, then unlocks it with a reason", async () => {
    fillMonth(2026, 11);
    const user = userEvent.setup();
    renderApp("/agenda/2026/11");
    await user.click(await screen.findByRole("button", { name: "Valider le mois" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Note (facultative)"), "CRA envoyé");
    await user.click(within(dialog).getByRole("button", { name: "Valider" }));

    expect(await screen.findByText(/Ce mois est validé/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appliquer" })).not.toBeInTheDocument();
    expect(await cell(/lundi 2 novembre, matin/)).toBeDisabled();
    expect(screen.getByText(/validé · CRA envoyé/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Déverrouiller" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Motif"), "Oubli d'un congé");
    await user.click(confirm);
    await waitFor(() => expect(agenda.lastBody).toEqual({ reason: "Oubli d'un congé" }));
    expect(await screen.findByRole("button", { name: "Appliquer" })).toBeInTheDocument();
  });

  it("navigates between months and rejects invalid routes", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/agenda/2026/12");
    await user.click(await screen.findByRole("link", { name: "Mois suivant" }));
    expect(router.state.location.pathname).toBe("/agenda/2027/1");
    await user.click(await screen.findByRole("link", { name: "Mois précédent" }));
    await user.click(await screen.findByRole("link", { name: "Mois précédent" }));
    expect(router.state.location.pathname).toBe("/agenda/2026/11");
    await user.click(screen.getByRole("link", { name: "Année 2026" }));
    expect(router.state.location.pathname).toBe("/agenda/2026");
  });

  it("shows a not-found page for invalid dates", async () => {
    renderApp("/agenda/2026/13");
    expect(await screen.findByText("Page introuvable")).toBeInTheDocument();
  });
});

describe("year view", () => {
  it("shows the twelve months, locks and totals", async () => {
    fillMonth(2026, 2);
    agenda.locked.set("2026-02", { at: "2026-03-01T09:00:00Z", note: null });
    const user = userEvent.setup();
    const { router } = renderApp("/agenda/2026");
    expect(await screen.findByRole("link", { name: "février" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^[a-zéû]+$/ })).toHaveLength(12);
    expect(await screen.findByLabelText("Validé")).toBeInTheDocument();
    expect(await screen.findByText(/20 jours/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /lundi 2 février — matin : Inter-contrat/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Année suivante" }));
    expect(router.state.location.pathname).toBe("/agenda/2027");
    await user.click(await screen.findByRole("link", { name: "mars" }));
    expect(router.state.location.pathname).toBe("/agenda/2027/3");
  });

  it("rejects an invalid year", async () => {
    renderApp("/agenda/1800");
    expect(await screen.findByText("Page introuvable")).toBeInTheDocument();
  });
});

describe("home and settings", () => {
  it("reminds unfilled half-days on the home page", async () => {
    agenda.unfilled = {
      count: 3,
      since: "2026-10-01",
      until: "2026-11-04",
      slots: [{ date: "2026-10-29", period: "PM" }],
    };
    const user = userEvent.setup();
    const { router } = renderApp("/");
    expect(await screen.findByText("3 demi-journées non saisies")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Compléter l'agenda" }));
    expect(router.state.location.pathname).toBe("/agenda/2026/10");
  });

  it("stores the public holidays region", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await pick(user, "Jours fériés", "Alsace-Moselle");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(backend.lastPatch).toMatchObject({ holiday_subdivision: "57" }));
  });

  it("manages day types", async () => {
    const user = userEvent.setup();
    renderApp("/directory/day-types");
    await user.click(await screen.findByRole("button", { name: "Nouveau type de journée" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom (français)"), "RTT");
    await user.type(within(dialog).getByLabelText("Nom (anglais)"), "RTT");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findAllByRole("cell", { name: "RTT" })).toHaveLength(2);
    expect(agenda.lastBody).toEqual({ kind: "LEAVE", name_fr: "RTT", name_en: "RTT" });

    await user.click(screen.getByRole("button", { name: "Modifier Congés payés" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Nature" })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Nom (anglais)"));
    await user.type(within(dialog).getByLabelText("Nom (anglais)"), "PTO");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(agenda.lastBody).toEqual({ name_fr: "Congés payés", name_en: "PTO" }),
    );

    agenda.subtypes[0]!.usage = 2;
    await user.click(screen.getByRole("button", { name: "Supprimer Congés payés" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    expect((await screen.findAllByText(/encore utilisé/)).length).toBeGreaterThan(0);
  });
});
