import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { agenda } from "../../test/agendaBackend";
import { archIds } from "../../test/architectureBackend";
import { dash } from "../../test/dashboardBackend";
import { docIds, docs } from "../../test/documentsBackend";
import { ids } from "../../test/directoryBackend";
import { addTask, microIds } from "../../test/microBackend";
import { missionIds, missions } from "../../test/missionsBackend";
import { renderApp } from "../../test/render";

vi.mock("../../components/mermaid", () => ({
  renderMermaid: vi.fn(async () => '<svg data-testid="mini-architecture"></svg>'),
}));

describe("mission dashboard (P10-3, ADR-0039)", () => {
  it("opens on the overview: KPIs, time by subject, technologies with suggestions", async () => {
    const user = userEvent.setup();
    renderApp(`/missions/${missionIds.current}`);
    expect(
      await screen.findByRole("tab", { name: "Vue d'ensemble", selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByText("20,5 jours")).toBeInTheDocument();
    expect(screen.getByText("33 jours")).toBeInTheDocument();
    expect(screen.getByText("21 h 30")).toBeInTheDocument(); // 1290 minutes

    // Ranked bars, largest first; beyond six subjects the tail folds into "others".
    const bars = within(screen.getByRole("list", { name: "Temps par sujet" })).getAllByRole(
      "listitem",
    );
    expect(bars).toHaveLength(7);
    expect(bars[0]).toHaveAccessibleName("Migration Kafka : 10 h, 47 %");
    expect(bars[6]).toHaveAccessibleName("2 autres sujets : 1 h, 5 %");

    // Python: manual 4, suggested 2; Kafka: suggested 5, not on the mission yet.
    expect(screen.getByText("suggéré 2")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Appliquer la pondération suggérée à Kafka" }),
    );
    await waitFor(() => expect(missions.lastBody).toEqual({ weight: 5, version: null }));
    expect(screen.getByText("Responsable Paiements", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
  });

  it("shows the architecture in small and its documents", async () => {
    dash.overview.architectures = [
      {
        id: archIds.si,
        company: { id: ids.bankCompany, name: "Banque Horizon" },
        name: "SI Horizon",
        lifecycle: "CURRENT",
        archived_at: null,
        member_count: 1,
        missions: [],
      },
    ];
    dash.overview.documents = [docs.items[0]!];
    dash.overview.time.by_subject = [];
    renderApp(`/missions/${missionIds.current}?tab=overview`);
    expect(await screen.findByRole("link", { name: "SI Horizon" })).toHaveAttribute(
      "href",
      `/architecture/architectures/${archIds.si}`,
    );
    expect(await screen.findByTestId("mini-architecture")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument();
    expect(screen.getByText("Aucune tâche faite pour l'instant.")).toBeInTheDocument();
  });
});

describe("career (P10-5)", () => {
  it("draws every mission on one time axis with its main technologies", async () => {
    const user = userEvent.setup();
    renderApp("/missions");
    await user.click(await screen.findByRole("link", { name: "Carrière" }));
    const list = await screen.findByRole("list", { name: "Carrière" });
    const item = within(list).getByRole("listitem");
    expect(within(item).getByRole("link", { name: "Horizon — Paiements" })).toBeInTheDocument();
    expect(within(item).getByText(/20,5 jours/)).toBeInTheDocument();
    expect(within(item).getByText("Python")).toBeInTheDocument();
    expect(within(list).getByText("2026")).toBeInTheDocument();
  });
});

describe("home page (P10-4)", () => {
  it("shows the current missions and recently edited documents", async () => {
    docs.items[1]!.updated_at = "2026-11-06T12:00:00Z";
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Missions en cours" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Agenda du jour" }).length).toBeGreaterThan(0);
    const recent = await screen.findByRole("heading", { name: "Documents modifiés récemment" });
    const links = within(recent.parentElement!).getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("Flux de paiement");
  });
});

describe("cross-links (P10-6, P10-7)", () => {
  it("goes from an agenda day to the architecture and the domain in one click", async () => {
    agenda.halfDays.set("2026-11-02|AM", {
      date: "2026-11-02",
      period: "AM",
      kind: "MISSION",
      mission_id: missionIds.current,
      subtype_id: null,
      location: null,
      note: null,
    });
    const task = addTask({ date: "2026-11-02", period: "AM", title: "Revue" }, microIds.kafka);
    task.domains = [{ id: archIds.api, name: "API" }];
    renderApp("/agenda/2026/11/2");
    expect(await screen.findByRole("link", { name: "Architecture SI Horizon" })).toHaveAttribute(
      "href",
      `/architecture/architectures/${archIds.si}`,
    );
    expect(screen.getByRole("link", { name: "API" })).toHaveAttribute(
      "href",
      `/architecture/domains/${archIds.api}`,
    );
  });

  it("highlights a subject's or a domain's tasks in the week view", async () => {
    addTask({ date: "2026-11-02", period: "AM", title: "Consommateurs" }, microIds.consumers);
    addTask({ date: "2026-11-02", period: "PM", title: "Veille" }, microIds.watch);
    const onApi = addTask(
      { date: "2026-11-03", period: "AM", title: "Contrat API" },
      microIds.kafka,
    );
    onApi.domains = [{ id: archIds.api, name: "API" }];
    renderApp(`/agenda/week/2026-11-02?subject=${microIds.kafka}`);
    expect(
      await screen.findByText("Les tâches du sujet « Migration Kafka » sont mises en évidence."),
    ).toBeInTheDocument();
    const card = (title: RegExp) =>
      screen.getByRole("button", { name: title }).closest(".mantine-Paper-root") as HTMLElement;
    // Consumers is a sub-subject of Kafka: kept; the intercontract watch is dimmed.
    await screen.findByRole("button", { name: /^Consommateurs/ });
    expect(card(/^Consommateurs/).style.opacity).toBe("1");
    expect(card(/^Veille/).style.opacity).toBe("0.3");

    renderApp(`/agenda/week/2026-11-02?domain=${archIds.api}`);
    expect(
      await screen.findByText("Les tâches sur le domaine « API » sont mises en évidence."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Tout afficher" }).at(-1)).toHaveAttribute(
      "href",
      "/agenda/week/2026-11-02",
    );
  });

  it("links the domain sheet's tasks to their day and to the filtered agenda", async () => {
    const user = userEvent.setup();
    renderApp(`/architecture/domains/${archIds.hub}`);
    await user.click(await screen.findByRole("tab", { name: "Sujets (0)" }));
    expect(screen.getByRole("link", { name: "Voir dans l'agenda" }).getAttribute("href")).toMatch(
      new RegExp(`^/agenda/week/\\d{4}-\\d{2}-\\d{2}\\?domain=${archIds.hub}$`),
    );
  });

  it("shows documents linking to a company or a contact", async () => {
    const user = userEvent.setup();
    docs.backlinks = [
      { type: "company", id: ids.bankCompany, documentId: docIds.root, label: "x" },
    ];
    renderApp(`/directory/companies/${ids.bankCompany}`);
    await user.click(await screen.findByRole("tab", { name: "Documents" }));
    expect(await screen.findByRole("link", { name: "Architecture Horizon" })).toBeInTheDocument();

    docs.backlinks = [{ type: "contact", id: ids.hugo, documentId: docIds.child, label: "x" }];
    renderApp(`/directory/contacts/${ids.hugo}`);
    expect(await screen.findByRole("link", { name: "Flux de paiement" })).toBeInTheDocument();
  });

  it("links subjects to the filtered agenda", async () => {
    renderApp(`/missions/${missionIds.current}?tab=subjects`);
    expect(
      await screen.findByRole("link", { name: "Voir Migration Kafka dans l'agenda" }),
    ).toHaveAttribute("href", expect.stringMatching(new RegExp(`\\?subject=${microIds.kafka}$`)));
  });
});
