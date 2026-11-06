/**
 * Shapes the architecture graph for display (P9-5 to P9-10, ADR-0038). Pure functions, no React:
 * filters, current / target / both views, collapsed groups, neighbours, ELK input and output.
 */

import type { Graph, Lifecycle } from "./api";

export type GraphView = "CURRENT" | "TARGET" | "BOTH";
type ApiNode = Graph["nodes"][number];
type ApiEdge = Graph["edges"][number];

/** Same vocabulary as the Mermaid export (ADR-0038). */
export const VIEW_LIFECYCLES: Record<GraphView, Lifecycle[] | null> = {
  CURRENT: ["CURRENT", "DEPRECATED"],
  TARGET: ["CURRENT", "TARGET"],
  BOTH: null,
};

export type Change = "added" | "removed" | null;

export interface ModelNode extends ApiNode {
  /** Nearest visible ancestor. */
  parentId: string | null;
  isGroup: boolean;
  collapsed: boolean;
  /** Descendants hidden by a collapsed group. */
  hiddenCount: number;
  change: Change;
}

export interface ModelEdge extends ApiEdge {
  source: string;
  target: string;
  change: Change;
  /** Rerouted to a collapsed group. */
  aggregated: boolean;
}

export interface GraphOptions {
  view: GraphView;
  kinds?: ReadonlySet<string>;
  owners?: ReadonlySet<string>;
  maxDepth?: number | null;
  collapsed?: ReadonlySet<string>;
}

const change = (lifecycle: Lifecycle, view: GraphView): Change =>
  view !== "BOTH"
    ? null
    : lifecycle === "TARGET"
      ? "added"
      : lifecycle === "DEPRECATED"
        ? "removed"
        : null;

export function buildModel(
  graph: Graph,
  options: GraphOptions,
): { nodes: ModelNode[]; edges: ModelEdge[] } {
  const lifecycles = VIEW_LIFECYCLES[options.view];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const kept = new Set(
    graph.nodes
      .filter((n) => !lifecycles || lifecycles.includes(n.lifecycle))
      .filter((n) => !options.kinds?.size || options.kinds.has(n.kind))
      .filter((n) => !options.owners?.size || (n.owner && options.owners.has(n.owner.id)))
      .filter((n) => options.maxDepth == null || n.depth <= options.maxDepth)
      .map((n) => n.id),
  );
  const nearestKept = (id: string | null): string | null => {
    let current = id;
    while (current && !kept.has(current)) current = byId.get(current)?.parent_id ?? null;
    return current;
  };
  const parentOf = new Map<string, string | null>();
  for (const id of kept) parentOf.set(id, nearestKept(byId.get(id)!.parent_id));

  // A node under a collapsed ancestor is hidden; it is represented by its top collapsed ancestor.
  const representative = new Map<string, string>();
  for (const id of kept) {
    let shownAs = id;
    for (let parent = parentOf.get(id) ?? null; parent; parent = parentOf.get(parent) ?? null) {
      if (options.collapsed?.has(parent)) shownAs = parent;
    }
    representative.set(id, shownAs);
  }
  const visible = [...kept].filter((id) => representative.get(id) === id);
  const hiddenCount = new Map<string, number>();
  for (const [id, shownAs] of representative) {
    if (id !== shownAs) hiddenCount.set(shownAs, (hiddenCount.get(shownAs) ?? 0) + 1);
  }
  const hasKeptChildren = new Set([...parentOf.values()].filter((p): p is string => Boolean(p)));

  const nodes: ModelNode[] = visible.map((id) => {
    const node = byId.get(id)!;
    const collapsed = Boolean(options.collapsed?.has(id)) && hasKeptChildren.has(id);
    return {
      ...node,
      parentId: parentOf.get(id) ?? null,
      isGroup: hasKeptChildren.has(id) && !collapsed,
      collapsed,
      hiddenCount: hiddenCount.get(id) ?? 0,
      change: change(node.lifecycle, options.view),
    };
  });

  const seen = new Set<string>();
  const edges: ModelEdge[] = [];
  for (const edge of graph.edges) {
    if (lifecycles && !lifecycles.includes(edge.lifecycle)) continue;
    const source = representative.get(edge.source_id);
    const target = representative.get(edge.target_id);
    if (!source || !target || source === target) continue;
    const aggregated = source !== edge.source_id || target !== edge.target_id;
    const key = aggregated ? `${source}>${target}` : edge.id;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      ...edge,
      source,
      target,
      aggregated,
      change: change(edge.lifecycle, options.view),
    });
  }
  return { nodes, edges };
}

/** Ids of the nodes directly related to `id`, `id` included (P9-7). */
export function neighbours(edges: readonly ModelEdge[], id: string | null): Set<string> {
  if (!id) return new Set();
  const result = new Set([id]);
  for (const edge of edges) {
    if (edge.source === id) result.add(edge.target);
    if (edge.target === id) result.add(edge.source);
  }
  return result;
}

/** Case- and accent-insensitive search on node names. */
export function matches(nodes: readonly ModelNode[], query: string): Set<string> {
  const normalize = (text: string) =>
    text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const needle = normalize(query);
  if (!needle) return new Set();
  return new Set(nodes.filter((n) => normalize(n.name).includes(needle)).map((n) => n.id));
}

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 64;
const GROUP_PADDING = "[top=40,left=16,bottom=16,right=16]";

export interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
}

/** ELK input: groups hold their children; ELK lays out the whole hierarchy at once. */
export function elkGraph(nodes: readonly ModelNode[], edges: readonly ModelEdge[]): ElkNode {
  const children = new Map<string | null, ModelNode[]>();
  for (const node of nodes)
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const toElk = (node: ModelNode): ElkNode =>
    node.isGroup
      ? {
          id: node.id,
          layoutOptions: { "elk.padding": GROUP_PADDING },
          children: (children.get(node.id) ?? []).map(toElk),
        }
      : { id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT };
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: (children.get(null) ?? []).map(toElk),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Positions relative to the parent group, as React Flow expects. A position saved by hand wins
 * over ELK's (P9-9); groups keep ELK's size.
 */
export function placements(
  layout: ElkNode,
  saved: ReadonlyMap<string, { x: number; y: number }>,
): Map<string, Placement> {
  const result = new Map<string, Placement>();
  const visit = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      const manual = saved.get(child.id);
      result.set(child.id, {
        x: manual?.x ?? child.x ?? 0,
        y: manual?.y ?? child.y ?? 0,
        width: child.width ?? NODE_WIDTH,
        height: child.height ?? NODE_HEIGHT,
      });
      visit(child);
    }
  };
  visit(layout);
  return result;
}
