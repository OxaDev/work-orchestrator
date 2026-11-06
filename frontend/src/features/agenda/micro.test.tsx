import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { agenda } from "../../test/agendaBackend";
import { addTask, micro, microIds } from "../../test/microBackend";
import { missionIds } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";
import { subjectPaths } from "../subjects/api";
import type { HalfDay } from "./api";
import { formatDuration } from "./duration";
import { canPlace, countedMinutes, dayPath, standupText, subjectLink, weekStart } from "./micro";
import type { CompatibilityRule, Standup, Task } from "./tasksApi";

type User = ReturnType<typeof userEvent.setup>;

async function pick(user: User, label: string, option: string) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

function halfDay(date: string, period: "AM" | "PM", kind: HalfDay["kind"], mission?: string) {
  agenda.halfDays.set(`${date}|${period}`, {
    date,
    period,
    kind,
    mission_id: mission ?? null,
    subtype_id: null,
    location: null,
    note: null,
  });
}

function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

const RULES: CompatibilityRule[] = [
  { kind: "MISSION", scopes: ["MISSION"], same_mission: true },
  { kind: "INTERCONTRACT", scopes: ["INTERCONTRACT", "PERSONAL", "TRAINING"], same_mission: false },
  { kind: "LEAVE", scopes: [], same_mission: false },
];

describe("micro agenda helpers", () => {
  it("mirrors the compatibility matrix served by the API (ADR-0020)", () => {
    const missionSubject = { scope: "MISSION" as const, mission_id: "m1" };
    expect(canPlace(RULES, { kind: "MISSION", mission_id: "m1" }, missionSubject)).toBe(true);
    expect(canPlace(RULES, { kind: "MISSION", mission_id: "m2" }, missionSubject)).toBe(false);
    const intercontract = { scope: "INTERCONTRACT" as const, mission_id: null };
    expect(canPlace(RULES, { kind: "MISSION", mission_id: "m1" }, intercontract)).toBe(false);
    expect(canPlace(RULES, { kind: "LEAVE", mission_id: null }, intercontract)).toBe(false);
    // Empty half-days are filled by the subject's kind, except for personal subjects.
    expect(canPlace(RULES, undefined, intercontract)).toBe(true);
    expect(canPlace(RULES, undefined, { scope: "PERSONAL", mission_id: null })).toBe(false);
    // Matrix not loaded yet: the server decides.
    expect(canPlace(undefined, { kind: "TRAINING", mission_id: null }, intercontract)).toBe(true);
  });

  it("computes weeks, paths, durations and links", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(dayPath("2026-11-04")).toBe("/agenda/2026/11/4");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(95)).toBe("1 h 35");
    expect(subjectLink({ id: "s", title: "S", scope: "MISSION", mission_id: "m" })).toBe(
      "/missions/m?tab=subjects",
    );
    expect(subjectLink({ id: "s", title: "S", scope: "TRAINING", mission_id: null })).toBe(
      "/agenda/subjects?scope=TRAINING",
    );
  });

  it("builds subject paths and counts only planned or done minutes (RG-06)", () => {
    const paths = subjectPaths(micro.subjects);
    expect(paths.get(microIds.consumers)).toBe("Migration Kafka › Consumers");
    const tasks = [
      { status: "PLANNED", duration_minutes: 60 },
      { status: "DONE", duration_minutes: 30 },
      { status: "CANCELLED", duration_minutes: 120 },
      { status: "CARRIED_OVER", duration_minutes: 120 },
    ] as Task[];
    expect(countedMinutes(tasks)).toBe(90);
  });

  it("writes the standup text from structured data (P5-9)", () => {
    const task = (title: string, status: Task["status"], ref: string | null = null) =>
      ({
        title,
        status,
        external_ref: ref,
        subject: { id: "s", title: "Kafka", scope: "MISSION", mission_id: "m" },
      }) as Task;
    const standup = {
      day: "2026-11-04",
      previous_day: "2026-11-03",
      previous: [task("Revue", "DONE", "K-2"), task("Démo", "PLANNED")],
      today: [task("Tests", "PLANNED"), task("Oublié", "CANCELLED")],
      log: { date: "2026-11-04", done: "Aide à Hugo", planned: "", blockers: "", updated_at: null },
    } as Standup;
    const text = standupText(standup, {
      yesterday: (day) => `Hier (${day}) :`,
      today: "Aujourd'hui :",
      blockers: "Blocages :",
      nothing: "rien",
      none: "aucun",
    });
    expect(text).toBe(
      [
        "Hier (2026-11-03) :",
        "- Revue (Kafka) [K-2]",
        "- Aide à Hugo",
        "",
        "Aujourd'hui :",
        "- Tests (Kafka)",
        "",
        "Blocages :",
        "- aucun",
      ].join("\n"),
    );
  });
});

describe("subjects (P5-3)", () => {
  it("shows the mission's subject tree, collapses it and adds sub-subjects", async () => {
    const user = userEvent.setup();
    renderApp(`/missions/${missionIds.current}?tab=subjects`);
    const tree = await screen.findByRole("tree", { name: "Sujets" });
    const child = await within(tree).findByRole("treeitem", { name: "Consumers" });
    expect(child).toHaveAttribute("aria-level", "2");
    expect(within(tree).getByText("2 tâches · 1 h 30 réalisées")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Replier Migration Kafka" }));
    expect(within(tree).queryByRole("treeitem", { name: "Consumers" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déplier Migration Kafka" }));

    await user.click(screen.getByRole("button", { name: "Ajouter un sous-sujet à Consumers" }));
    await user.type(
      screen.getByRole("textbox", { name: "Ajouter un sous-sujet à Consumers" }),
      "Rejeu des messages{Enter}",
    );
    await within(tree).findByRole("treeitem", { name: "Rejeu des messages" });
    expect(micro.lastBody).toMatchObject({
      title: "Rejeu des messages",
      scope: "MISSION",
      mission_id: missionIds.current,
      parent_id: microIds.consumers,
      status: "OPEN",
    });

    await user.type(screen.getByRole("textbox", { name: "Nouveau sujet" }), "Refonte SSO{Enter}");
    expect(await within(tree).findByRole("treeitem", { name: "Refonte SSO" })).toHaveAttribute(
      "aria-level",
      "1",
    );
  });

  it("edits, archives and deletes subjects outside missions", async () => {
    const user = userEvent.setup();
    renderApp("/agenda/subjects");
    await screen.findByRole("treeitem", { name: "Veille Rust" });
    expect(screen.queryByText("Migration Kafka")).not.toBeInTheDocument();
    expect(screen.getByText("Veille")).toBeInTheDocument(); // category badge

    await user.click(screen.getByRole("button", { name: "Modifier Veille Rust" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifier le sujet" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Lien externe (ticket, page…)" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Lien externe (ticket, page…)" }),
      "pas une url",
    );
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText(/adresse complète/)).toBeInTheDocument();
    await user.clear(within(dialog).getByRole("textbox", { name: "Lien externe (ticket, page…)" }));
    await pick(user, "Statut", "En cours");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(micro.lastBody).toMatchObject({ status: "IN_PROGRESS", external_url: null }),
    );

    await user.click(screen.getByRole("button", { name: "Archiver Veille Rust" }));
    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: "Veille Rust" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("switch", { name: "Afficher les archivés" }));
    await user.click(await screen.findByRole("button", { name: "Restaurer Veille Rust" }));
    expect(micro.lastUrl).toBe(`restore:${microIds.watch}`);

    await user.click(screen.getByRole("button", { name: "Supprimer Veille Rust" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer" }));
    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: "Veille Rust" })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("radio", { name: "Formation" }));
    expect(await screen.findByText("Aucun sujet pour l'instant.")).toBeInTheDocument();
  });

  it("manages subject categories in the directory", async () => {
    const user = userEvent.setup();
    renderApp("/directory/subject-categories");
    await screen.findByText("Veille");
    await user.click(screen.getByRole("button", { name: "Nouvelle catégorie" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findAllByText("Obligatoire.")).toHaveLength(2);
    await user.type(within(dialog).getByRole("textbox", { name: "Nom (français)" }), "Avant-vente");
    await user.type(within(dialog).getByRole("textbox", { name: "Nom (anglais)" }), "Pre-sales");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Avant-vente")).toBeInTheDocument();
    expect(micro.lastBody).toEqual({ name_fr: "Avant-vente", name_en: "Pre-sales" });
  });
});

describe("week view (P5-10)", () => {
  it("shows tasks by half-day and moves them by drag and drop, never where they cannot go", async () => {
    halfDay("2026-11-02", "AM", "MISSION", missionIds.current);
    halfDay("2026-11-02", "PM", "INTERCONTRACT");
    addTask(
      { date: "2026-11-02", period: "AM", title: "Revue", duration_minutes: 180 },
      microIds.consumers,
    );
    addTask(
      { date: "2026-11-02", period: "AM", title: "Réunion", duration_minutes: 90, kind: "MEETING" },
      microIds.kafka,
    );
    renderApp("/agenda/week/2026-11-04");

    expect(
      await screen.findByRole("heading", { name: "Semaine du 2 novembre 2026" }),
    ).toBeInTheDocument();
    const monday = await screen.findByRole("region", { name: /lundi 2 novembre, matin : Horizon/ });
    expect(await within(monday).findByText("Revue")).toBeInTheDocument();
    expect(within(monday).getByText("4 h 30")).toBeInTheDocument();
    expect(within(monday).getByText("Plus de 4 h")).toBeInTheDocument();

    const card = screen.getByRole("button", { name: /^Revue — Consumers/ }).closest("[draggable]")!;
    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    const afternoon = screen.getByRole("region", {
      name: /lundi 2 novembre, après-midi : Inter-contrat/,
    });
    const tuesday = screen.getByRole("region", { name: /mardi 3 novembre, matin : Non saisi/ });
    expect(afternoon).toHaveAttribute("data-drop", "forbidden");
    expect(tuesday).toHaveAttribute("data-drop", "allowed");

    fireEvent.drop(afternoon, { dataTransfer: transfer });
    expect(micro.lastBody).toBeNull();
    fireEvent.dragOver(tuesday, { dataTransfer: transfer });
    fireEvent.drop(tuesday, { dataTransfer: transfer });
    await waitFor(() => expect(micro.lastBody).toEqual({ date: "2026-11-03", period: "AM" }));
    expect(await within(tuesday).findByText("Revue")).toBeInTheDocument();
  });

  it("opens a task to edit it, carry it over or delete it", async () => {
    const user = userEvent.setup();
    halfDay("2026-11-02", "PM", "INTERCONTRACT");
    const task = addTask({ date: "2026-11-02", period: "PM", title: "Lire le RFC" });
    renderApp("/agenda/week/2026-11-02");
    await user.click(await screen.findByRole("button", { name: /^Lire le RFC/ }));
    const dialog = await screen.findByRole("dialog", { name: "Modifier la tâche" });
    await pick(user, "Statut", "Faite");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(micro.lastBody).toMatchObject({ status: "DONE" }));

    await user.click(await screen.findByRole("button", { name: /^Lire le RFC/ }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(micro.lastUrl).toBe(`delete:${task.id}`));
  });
});

describe("task entry (P5-4, P5-13)", () => {
  it("opens with `n`, offers only compatible subjects and warns when a half-day is overbooked", async () => {
    const user = userEvent.setup();
    halfDay("2026-11-03", "AM", "INTERCONTRACT");
    addTask({ date: "2026-11-03", period: "AM", title: "Atelier", duration_minutes: 200 });
    renderApp("/");
    await screen.findByRole("heading", { name: "Bonjour" });
    await user.keyboard("n");
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle tâche" });

    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-11-03" } });
    // The default period follows the clock (afternoon after 1 pm): pick the morning.
    await user.click(within(dialog).getByRole("radio", { name: "matin" }));
    expect(
      await within(dialog).findByText("Cette demi-journée : Inter-contrat"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("combobox", { name: "Sujet" }));
    expect(await screen.findByRole("option", { name: "Veille Rust" })).toBeInTheDocument();
    // RG-03: no mission subject in an intercontract half-day.
    expect(screen.queryByRole("option", { name: "Migration Kafka" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Veille Rust" }));

    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText("Obligatoire.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Intitulé" }), "Lire Rust Book");
    await user.click(within(dialog).getByRole("radio", { name: "Réunion" }));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(micro.lastBody).toMatchObject({
        date: "2026-11-03",
        subject_id: microIds.watch,
        title: "Lire Rust Book",
        kind: "MEETING",
        duration_minutes: 60,
        status: "PLANNED",
        participant_ids: [],
      }),
    );
    expect(
      await screen.findByText(/4 h 20 de travail dans cette demi-journée/),
    ).toBeInTheDocument();
  });

  it("shows translated errors from the server", async () => {
    const user = userEvent.setup();
    halfDay("2026-11-03", "AM", "MISSION", missionIds.current);
    renderApp("/agenda/week/2026-11-02");
    await user.click(
      await screen.findByRole("button", { name: "Ajouter une tâche le mardi 3 novembre, matin" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle tâche" });
    // Switch to the afternoon, then back: the mission subject is offered in the morning.
    await user.click(within(dialog).getByRole("radio", { name: "après-midi" }));
    await user.click(within(dialog).getByRole("radio", { name: "matin" }));
    await pick(user, "Sujet", "Migration Kafka › Consumers");
    await user.type(within(dialog).getByRole("textbox", { name: "Intitulé" }), "Tests");
    agenda.halfDays.set("2026-11-03|AM", {
      ...agenda.halfDays.get("2026-11-03|AM")!,
      kind: "LEAVE",
      mission_id: null,
    });
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(
      await screen.findByText(/Ce sujet ne peut pas aller dans cette demi-journée/),
    ).toBeInTheDocument();
  });
});

describe("day view (P5-11)", () => {
  it("lists the day's tasks with their totals and saves the daily log", async () => {
    const user = userEvent.setup();
    halfDay("2026-11-02", "AM", "MISSION", missionIds.current);
    addTask(
      { date: "2026-11-02", period: "AM", title: "Revue", duration_minutes: 90, status: "DONE" },
      microIds.kafka,
    );
    addTask({
      date: "2026-11-02",
      period: "PM",
      title: "Annulée",
      duration_minutes: 60,
      status: "CANCELLED",
    });
    renderApp("/agenda/2026/11/2");

    expect(await screen.findByRole("heading", { name: "lundi 2 novembre" })).toBeInTheDocument();
    expect(await screen.findByText("Total de la journée : 1 h 30")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la mission" })).toHaveAttribute(
      "href",
      `/missions/${missionIds.current}`,
    );
    expect(screen.getByRole("link", { name: "Sujet : Migration Kafka" })).toHaveAttribute(
      "href",
      `/missions/${missionIds.current}?tab=subjects`,
    );

    await user.type(screen.getByRole("textbox", { name: "Blocages" }), "VPN en panne");
    await user.click(screen.getByRole("button", { name: "Enregistrer le journal" }));
    await waitFor(() =>
      expect(micro.lastBody).toEqual({ done: "", planned: "", blockers: "VPN en panne" }),
    );
    await user.click(screen.getByRole("link", { name: "Jour suivant" }));
    expect(await screen.findByRole("heading", { name: "mardi 3 novembre" })).toBeInTheDocument();
  });

  it("rejects impossible dates", async () => {
    renderApp("/agenda/2026/2/31");
    expect(await screen.findByText(/introuvable/i)).toBeInTheDocument();
  });
});

describe("standup (P5-12)", () => {
  it("settles yesterday's tasks, plans today and copies the standup", async () => {
    const user = userEvent.setup();
    addTask({ date: "2026-11-03", period: "AM", title: "Revue", status: "DONE" });
    addTask({ date: "2026-11-03", period: "PM", title: "Démo" });
    addTask({ date: "2026-11-03", period: "PM", title: "Bench" });
    addTask({ date: "2026-11-03", period: "PM", title: "Doc" });
    addTask({ date: "2026-11-04", period: "AM", title: "Tests" });
    renderApp("/agenda/standup?date=2026-11-04");

    expect(
      await screen.findByRole("heading", { name: "Standup — mercredi 4 novembre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "La dernière fois : mardi 3 novembre" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Marquer Démo comme faite" }));
    await waitFor(() => expect(micro.lastBody).toEqual({ status: "DONE" }));
    await user.click(await screen.findByRole("button", { name: "Reporter Bench" }));
    await waitFor(() => expect(micro.lastBody).toEqual({ target: null, not_before: "2026-11-04" }));
    await user.click(await screen.findByRole("button", { name: "Annuler Doc" }));
    await waitFor(() => expect(micro.lastBody).toEqual({ status: "CANCELLED" }));

    const text = screen.getByRole("textbox", { name: "Mon standup" });
    await waitFor(() =>
      expect((text as HTMLTextAreaElement).value).toContain("- Démo (Veille Rust)"),
    );
    expect((text as HTMLTextAreaElement).value).toContain(
      "Aujourd'hui :\n- Tests (Veille Rust)\n- Bench (Veille Rust)",
    );
    await user.click(screen.getByRole("button", { name: "Copier mon standup" }));
    expect(await navigator.clipboard.readText()).toContain("La dernière fois (mardi 3 novembre) :");
    expect(await screen.findByText("Standup copié.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Planifier une tâche" }));
    expect(await screen.findByRole("dialog", { name: "Nouvelle tâche" })).toBeInTheDocument();
  });

  it("is reachable from the home page", async () => {
    renderApp("/");
    expect(await screen.findByRole("link", { name: "Préparer mon standup" })).toHaveAttribute(
      "href",
      "/agenda/standup",
    );
  });
});
