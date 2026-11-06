import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ELK from "elkjs/lib/elk.bundled.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { arch, archIds } from "../../test/architectureBackend";
import { docIds } from "../../test/documentsBackend";
import { renderApp } from "../../test/render";
import type { Graph } from "./api";
import { buildModel, type ElkNode, elkGraph, matches, neighbours, placements } from "./graphModel";

// The preview renders through Mermaid, which needs a layout engine jsdom lacks.
vi.mock("../../components/mermaid", () => ({
  renderMermaid: vi.fn(async () => '<svg data-testid="preview"></svg>'),
}));

// React Flow measures nodes: give jsdom sizes and a matrix (xyflow testing guide).
const originals = {
  ResizeObserver: window.ResizeObserver,
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
};
beforeAll(() => {
  window.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
    m22 = 1;
  };
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get: () => 800 },
    offsetWidth: { configurable: true, get: () => 1200 },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
});
afterAll(() => {
  window.ResizeObserver = originals.ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", originals.offsetHeight!);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", originals.offsetWidth!);
});

const n = (
  id: string,
  parent: string | null,
  fields: Partial<Graph["nodes"][number]> = {},
): Graph["nodes"][number] => ({
  id,
  parent_id: parent,
  name: id.toUpperCase(),
  kind: "SERVICE",
  lifecycle: "CURRENT",
  criticality: null,
  depth: 0,
  member: parent === null,
  owner: null,
  ...fields,
});
const e = (
  id: string,
  source: string,
  target: string,
  fields: Partial<Graph["edges"][number]> = {},
): Graph["edges"][number] => ({
  id,
  source_id: source,
  target_id: target,
  type: "CALLS",
  label: null,
  protocol: null,
  sync_mode: null,
  lifecycle: "CURRENT",
  ...fields,
});

/** pay > hub > {api, db (target), batch (deprecated)}; crm alone. */
const GRAPH: Graph = {
  architecture: { id: "arch", name: "SI" },
  nodes: [
    n("pay", null, { kind: "BUSINESS_DOMAIN" }),
    n("hub", "pay", { kind: "APPLICATION", depth: 1, owner: { id: "team", name: "Équipe" } }),
    n("api", "hub", { depth: 2, name: "Réseau API" }),
    n("db", "hub", { kind: "DATABASE", depth: 2, lifecycle: "TARGET" }),
    n("batch", "hub", { depth: 2, lifecycle: "DEPRECATED" }),
    n("crm", null, { kind: "APPLICATION" }),
  ],
  edges: [
    e("e1", "api", "db", { type: "WRITES_TO", lifecycle: "TARGET" }),
    e("e2", "batch", "crm"),
    e("e3", "api", "crm", { sync_mode: "ASYNC" }),
    e("e4", "crm", "api"),
  ],
};

describe("graph model (P9-7, P9-10, ADR-0038)", () => {
  it("shows today, tomorrow or both, marking changes", () => {
    const ids = (view: "CURRENT" | "TARGET" | "BOTH") =>
      buildModel(GRAPH, { view }).nodes.map((node) => node.id);
    expect(ids("CURRENT")).not.toContain("db");
    expect(ids("CURRENT")).toContain("batch");
    expect(ids("TARGET")).toContain("db");
    expect(ids("TARGET")).not.toContain("batch");
    const both = buildModel(GRAPH, { view: "BOTH" });
    expect(both.nodes.find((x) => x.id === "db")!.change).toBe("added");
    expect(both.nodes.find((x) => x.id === "batch")!.change).toBe("removed");
    expect(both.edges.find((x) => x.id === "e1")!.change).toBe("added");
    expect(buildModel(GRAPH, { view: "CURRENT" }).edges.map((x) => x.id)).toEqual([
      "e2",
      "e3",
      "e4",
    ]);
  });

  it("filters by kind, team and depth, re-attaching to the nearest kept ancestor", () => {
    const services = buildModel(GRAPH, {
      view: "CURRENT",
      kinds: new Set(["SERVICE", "BUSINESS_DOMAIN"]),
    });
    expect(Object.fromEntries(services.nodes.map((x) => [x.id, x.parentId]))).toEqual({
      pay: null,
      api: "pay",
      batch: "pay",
    });
    expect(services.nodes.find((x) => x.id === "pay")!.isGroup).toBe(true);
    // Edges need both ends visible.
    expect(services.edges).toEqual([]);
    const team = buildModel(GRAPH, { view: "CURRENT", owners: new Set(["team"]) });
    expect(team.nodes.map((x) => x.id)).toEqual(["hub"]);
    const shallow = buildModel(GRAPH, { view: "BOTH", maxDepth: 1 });
    expect(shallow.nodes.map((x) => x.id).sort()).toEqual(["crm", "hub", "pay"]);
    expect(shallow.nodes.find((x) => x.id === "hub")!.isGroup).toBe(false);
  });

  it("collapses a group: its edges attach to it, without duplicates nor loops", () => {
    const model = buildModel(GRAPH, { view: "BOTH", collapsed: new Set(["hub"]) });
    const hub = model.nodes.find((x) => x.id === "hub")!;
    expect(hub).toMatchObject({ collapsed: true, isGroup: false, hiddenCount: 3 });
    expect(model.nodes.map((x) => x.id)).not.toContain("api");
    // e1 (api→db) becomes a loop on hub and disappears; e2/e3 merge into hub→crm.
    expect(model.edges.map((x) => [x.source, x.target, x.aggregated])).toEqual([
      ["hub", "crm", true],
      ["crm", "hub", true],
    ]);
    // Collapsing a leaf does nothing.
    expect(
      buildModel(GRAPH, { view: "BOTH", collapsed: new Set(["crm"]) }).nodes.find(
        (x) => x.id === "crm",
      )!.collapsed,
    ).toBe(false);
  });

  it("finds neighbours and searches without accents", () => {
    const { nodes, edges } = buildModel(GRAPH, { view: "CURRENT" });
    expect([...neighbours(edges, "crm")].sort()).toEqual(["api", "batch", "crm"]);
    expect(neighbours(edges, null).size).toBe(0);
    expect([...matches(nodes, "reseau")]).toEqual(["api"]);
    expect(matches(nodes, "  ").size).toBe(0);
  });

  it("lays groups out with ELK and keeps positions moved by hand (P9-5, P9-9)", async () => {
    const { nodes, edges } = buildModel(GRAPH, { view: "BOTH" });
    const input = elkGraph(nodes, edges);
    expect(input.children!.map((c) => c.id).sort()).toEqual(["crm", "pay"]);
    expect(input.children!.find((c) => c.id === "pay")!.children![0]!.id).toBe("hub");
    const result = (await new ELK().layout(input as never)) as unknown as ElkNode;
    const placed = placements(result, new Map([["crm", { x: 5, y: 7 }]]));
    expect(placed.get("crm")).toMatchObject({ x: 5, y: 7, width: 200, height: 64 });
    const pay = placed.get("pay")!;
    const hub = placed.get("hub")!;
    // Groups are sized around their content; children positions are relative to the group.
    expect(pay.width).toBeGreaterThan(hub.width);
    expect(placed.get("api")!.x).toBeGreaterThanOrEqual(0);
  });
});

describe("Mermaid output (P9-4, ADR-0025)", () => {
  // Every backend snapshot goes through the real Mermaid parser.
  const snapshots = import.meta.glob("../../../../backend/tests/unit/snapshots/*.mmd", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("finds the backend snapshots", () => {
    expect(Object.keys(snapshots).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.entries(snapshots))("parses %s", async (_, code) => {
    const mermaid = (await vi.importActual<typeof import("mermaid")>("mermaid")).default;
    await expect(mermaid.parse(code)).resolves.toBeTruthy();
  });
});

describe("graph view (P9-5 to P9-11)", () => {
  it("draws the architecture, filters it and exports Mermaid", async () => {
    const user = userEvent.setup();
    renderApp(`/architecture/architectures/${archIds.si}`);
    await user.click(await screen.findByRole("link", { name: "Vue graphe" }));
    expect(await screen.findByRole("heading", { name: "SI Horizon — graphe" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Service API" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Domaine métier Paiements" })).toBeInTheDocument();
    // Current view: the target database is not there yet.
    expect(screen.queryByRole("group", { name: "Base de données Base" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Les deux" }));
    expect(await screen.findByRole("group", { name: "Base de données Base" })).toHaveTextContent(
      "nouveau",
    );

    // Collapsing the application hides its components.
    await user.click(screen.getByRole("button", { name: "Replier Hub" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Service API" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("group", { name: "Application Hub" })).toHaveTextContent("+2 masqués");
    await user.click(screen.getByRole("button", { name: "Déplier Hub" }));
    expect(await screen.findByRole("group", { name: "Service API" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Trouver un domaine" }), "base");
    await user.click(screen.getByRole("button", { name: "Disposition automatique" }));
    await waitFor(() => expect(arch.lastUrl).toBe("reset-layout"));

    await user.click(screen.getByRole("button", { name: "Exporter en Mermaid" }));
    const dialog = await screen.findByRole("dialog", { name: "Export Mermaid" });
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Code Mermaid" })).toHaveValue(
        "flowchart LR\n    a --> b\n",
      ),
    );
    expect(arch.mermaidQuery).toContain("view=BOTH");
    expect(arch.mermaidQuery).toContain("lang=fr");
    await user.click(within(dialog).getByRole("radio", { name: "De haut en bas" }));
    await waitFor(() => expect(arch.mermaidQuery).toContain("direction=TB"));
    await user.click(within(dialog).getByRole("radio", { name: "Carte mentale" }));
    await waitFor(() => expect(arch.mermaidQuery).toContain("format=mindmap"));
    await user.click(within(dialog).getByRole("button", { name: "Copier le code" }));
    expect(await navigator.clipboard.readText()).toContain("mindmap");
    expect(await within(dialog).findByTestId("preview")).toBeInTheDocument();
  });

  it("opens a domain sheet on double click", async () => {
    const { router } = renderApp(`/architecture/architectures/${archIds.si}/graph`);
    fireEvent.doubleClick(await screen.findByRole("group", { name: "Service API" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/architecture/domains/${archIds.api}`),
    );
  });
});

describe("knowledge graph (P9-12)", () => {
  it("shows documents and what they link to, and opens them", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/documents");
    await user.click(await screen.findByRole("link", { name: "Graphe de connaissance" }));
    // A plain click: user-event's pointer simulation trips React Flow's drag handler in jsdom.
    fireEvent.click(await screen.findByLabelText("Document Flux de paiement"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${docIds.child}`));
  });
});
