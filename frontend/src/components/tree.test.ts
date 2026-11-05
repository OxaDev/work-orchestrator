import { describe, expect, it } from "vitest";

import { buildTree, flattenTree, subtreeIds } from "./tree";

const items = [
  { id: "b", parent_id: "a", name: "B" },
  { id: "a", parent_id: null, name: "A" },
  { id: "c", parent_id: "b", name: "C" },
  { id: "d", parent_id: "a", name: "D" },
  { id: "orphan", parent_id: "missing", name: "O" },
];
const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name);

describe("tree helpers (ADR-0022)", () => {
  it("builds a sorted forest and keeps orphans at the root", () => {
    const tree = buildTree(items, byName);
    expect(tree.map((n) => n.item.id)).toEqual(["a", "orphan"]);
    expect(tree[0]!.children.map((n) => n.item.id)).toEqual(["b", "d"]);
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it("flattens depth-first", () => {
    expect(flattenTree(buildTree(items, byName)).map((n) => n.item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "orphan",
    ]);
  });

  it("lists a node and all its descendants", () => {
    expect(subtreeIds(items, "a")).toEqual(new Set(["a", "b", "c", "d"]));
    expect(subtreeIds(items, "c")).toEqual(new Set(["c"]));
  });
});
