/** Builds a forest from a flat list of `{ id, parent_id }` nodes (ADR-0022). */

export interface FlatNode {
  id: string;
  parent_id: string | null;
}

export interface TreeNode<T extends FlatNode> {
  item: T;
  children: TreeNode<T>[];
  depth: number;
}

export function buildTree<T extends FlatNode>(
  items: readonly T[],
  compare: (a: T, b: T) => number = () => 0,
): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(items.map((item) => item.id));
  for (const item of items) {
    // Orphans (parent filtered out) are shown at the root.
    const parent = item.parent_id && ids.has(item.parent_id) ? item.parent_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
  }
  const visit = (parent: string | null, depth: number): TreeNode<T>[] =>
    [...(byParent.get(parent) ?? [])]
      .sort(compare)
      .map((item) => ({ item, depth, children: visit(item.id, depth + 1) }));
  return visit(null, 0);
}

/** Ids of `id` and all its descendants: these cannot become its new parent. */
export function subtreeIds<T extends FlatNode>(items: readonly T[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parent_id && result.has(item.parent_id) && !result.has(item.id)) {
        result.add(item.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Depth-first flattening, handy for indented selects. */
export function flattenTree<T extends FlatNode>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}
