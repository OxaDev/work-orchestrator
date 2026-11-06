import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { missionIds, missions } from "../test/missionsBackend";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const failure = () =>
  HttpResponse.json({ code: "INTERNAL_ERROR", detail: "x", params: {} }, { status: 500 });

describe("loading errors, crashes and empty states (P12-5)", () => {
  it("reports a failed read once, translated, and retries on demand", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(http.get("*/api/v1/missions", () => (fail ? failure() : undefined)));
    renderApp("/missions");
    const toast = await screen.findByRole("alert");
    expect(within(toast).getByText("Chargement impossible")).toBeInTheDocument();
    expect(within(toast).getByText("Une erreur inattendue est survenue.")).toBeInTheDocument();

    fail = false;
    await user.click(within(toast).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: /^Horizon — Paiements/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Chargement impossible")).not.toBeInTheDocument(),
    );
  });

  it("does not toast what the page already shows", async () => {
    server.use(http.get("*/api/v1/missions/:id", failure));
    renderApp(`/missions/${missionIds.current}`);
    expect(await screen.findByText("Une erreur inattendue est survenue.")).toBeInTheDocument();
    expect(screen.queryByText("Chargement impossible")).not.toBeInTheDocument();
  });

  it("keeps the shell and offers a way out when a page crashes", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    // A malformed answer makes the page throw while rendering.
    server.use(http.get("*/api/v1/missions", () => HttpResponse.json({ items: null, total: 1 })));
    renderApp("/missions");
    expect(await screen.findByText("Cette page n'a pas pu s'afficher")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: "Recharger" })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "Accueil" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("navigation", { name: "Menu principal" })).toBeInTheDocument();
    quiet.mockRestore();
  });

  it("an empty list proposes what to do", async () => {
    const user = userEvent.setup();
    missions.items = [];
    renderApp("/missions");
    expect(await screen.findByText("Aucune mission pour le moment.")).toBeInTheDocument();
    const create = screen.getAllByRole("button", { name: "Nouvelle mission" });
    expect(create).toHaveLength(2); // header and empty state
    await user.click(create[1]!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
