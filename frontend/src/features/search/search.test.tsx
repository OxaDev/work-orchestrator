import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { data } from "../../test/dataBackend";
import { renderApp } from "../../test/render";
import { resultPath, type SearchResult } from "./api";
import { HIT_END, HIT_START, highlightParts } from "./snippet";

const result = (type: SearchResult["type"], date: string | null = null): SearchResult => ({
  type,
  id: "id-1",
  title: "Kubernetes",
  snippet: "",
  date,
  archived: false,
  rank: 1,
});

describe("search helpers (P11-3, ADR-0040)", () => {
  it("splits snippets on the server's private-use markers, never parsing HTML", () => {
    expect(highlightParts(`a ${HIT_START}hit${HIT_END} <b>b</b>`)).toEqual([
      { text: "a ", hit: false },
      { text: "hit", hit: true },
      { text: " <b>b</b>", hit: false },
    ]);
    expect(highlightParts(`${HIT_START}open`)).toEqual([{ text: "open", hit: true }]);
    expect(highlightParts("")).toEqual([]);
  });

  it("opens each kind of result on its page", () => {
    expect(resultPath(result("document"))).toBe("/documents/id-1");
    expect(resultPath(result("daily_log", "2026-03-03"))).toBe("/agenda/standup?date=2026-03-03");
    expect(resultPath(result("task", "2026-03-02"))).toBe("/agenda/2026/3/2");
    expect(resultPath(result("subject"))).toBe("/subjects/id-1");
    expect(resultPath(result("domain"))).toBe("/architecture/domains/id-1");
    expect(resultPath(result("architecture"))).toBe("/architecture/architectures/id-1");
    expect(resultPath(result("mission"))).toBe("/missions/id-1");
    expect(resultPath(result("contact"))).toBe("/directory/contacts/id-1");
    expect(resultPath(result("company"))).toBe("/directory/companies/id-1");
    expect(resultPath(result("technology"))).toBe("/directory/technologies?q=Kubernetes");
  });
});

describe("Ctrl+K palette (P11-3)", () => {
  it("opens with the shortcut, searches as you type and opens a result", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await screen.findByRole("button", { name: /Rechercher/ });
    fireEvent.keyDown(document.documentElement, { key: "k", code: "KeyK", ctrlKey: true });
    const input = await screen.findByRole("textbox", { name: /Rechercher partout/ });
    const palette = screen.getByRole("dialog");
    // Quick actions come first, before typing anything.
    expect(within(palette).getByText("Nouvelle tâche")).toBeInTheDocument();

    await user.type(input, "kafka");
    const hit = await screen.findByText("consommateurs");
    expect(hit.tagName).toBe("MARK");
    expect(screen.getByText("Archivé")).toBeInTheDocument();
    expect(screen.getByText("Tâche")).toBeInTheDocument();
    expect(within(palette).queryByText("Nouvelle tâche")).not.toBeInTheDocument();
    expect(data.queries.at(-1)).toBe("kafka");

    await user.click(screen.getByText("Migration Kafka"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/documents/doc-kafka"));
  });

  it("says when nothing matches", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("button", { name: /Rechercher/ }));
    await user.type(await screen.findByRole("textbox", { name: /Rechercher partout/ }), "zzz");
    expect(await screen.findByText("Aucun résultat.")).toBeInTheDocument();
  });

  it("runs actions: new mission opens the creation form, new task the quick entry", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: /Rechercher/ }));
    await user.type(await screen.findByRole("textbox", { name: /Rechercher partout/ }), "miss");
    await user.click(await screen.findByText("Nouvelle mission"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/missions"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).toBe(""));

    await user.click(screen.getByRole("button", { name: /Rechercher/ }));
    await user.click(within(await screen.findByRole("dialog")).getByText("Nouvelle tâche"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
