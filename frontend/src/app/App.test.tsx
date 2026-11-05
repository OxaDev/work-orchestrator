import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "../test/render";
import { server } from "../test/server";
import { isActive } from "./navigation";

describe("application shell", () => {
  it("renders the navigation in French by default", async () => {
    renderApp("/");
    const nav = await screen.findByRole("navigation");
    for (const label of [
      "Accueil",
      "Agenda",
      "Missions",
      "Architecture",
      "Documents",
      "Annuaire",
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it("switches the interface to English", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByText("EN"));
    expect(
      await within(screen.getByRole("navigation")).findByText("Directory"),
    ).toBeInTheDocument();
  });

  it("toggles the color scheme", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const toggle = await screen.findByRole("button", { name: "Basculer thème clair / sombre" });
    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  });

  it("navigates to a section announced for a later phase", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(within(await screen.findByRole("navigation")).getByText("Documents"));
    expect(router.state.location.pathname).toBe("/documents");
    expect(await screen.findByText(/phase P7/)).toBeInTheDocument();
  });

  it("keeps deep links inside a section", async () => {
    renderApp("/documents/some/page");
    expect(await screen.findByText(/phase P7/)).toBeInTheDocument();
  });

  it("shows a not-found page for unknown routes", async () => {
    renderApp("/nope");
    expect(await screen.findByText("Page introuvable")).toBeInTheDocument();
  });
});

describe("home page health card", () => {
  it("shows the API as operational", async () => {
    renderApp("/");
    expect(await screen.findByText("API et base de données opérationnelles")).toBeInTheDocument();
    expect(screen.getByText("Version 0.1.0")).toBeInTheDocument();
  });

  it("translates backend error codes", async () => {
    server.use(
      http.get("*/api/v1/health", () =>
        HttpResponse.json(
          { code: "DATABASE_UNAVAILABLE", detail: "Database unreachable", params: {} },
          { status: 503 },
        ),
      ),
    );
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La base de données est indisponible.",
    );
  });

  it("falls back to a generic message for unknown codes", async () => {
    server.use(
      http.get("*/api/v1/health", () =>
        HttpResponse.json({ code: "SOMETHING_NEW", detail: "", params: {} }, { status: 500 }),
      ),
    );
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur inconnue (SOMETHING_NEW).");
  });

  it("reports an unreachable server", async () => {
    server.use(http.get("*/api/v1/health", () => HttpResponse.error()));
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Le serveur est injoignable.");
  });
});

describe("isActive", () => {
  it.each([
    ["/", "/", true],
    ["/", "/agenda", false],
    ["/agenda", "/agenda", true],
    ["/agenda", "/agenda/2026/11", true],
    ["/agenda", "/agendas", false],
  ])("isActive(%s, %s) = %s", (item, current, expected) => {
    expect(isActive(item, current)).toBe(expected);
  });
});
