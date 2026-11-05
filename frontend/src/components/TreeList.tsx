import { Box, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { buildTree, type FlatNode, type TreeNode } from "./tree";

interface TreeListProps<T extends FlatNode> {
  items: readonly T[];
  label: (item: T) => ReactNode;
  actions?: (item: T) => ReactNode;
  compare?: (a: T, b: T) => number;
  empty?: ReactNode;
  "aria-label"?: string;
}

/** Indented, accessible tree (role="tree") with per-node actions. */
export function TreeList<T extends FlatNode>({
  items,
  label,
  actions,
  compare,
  empty,
  "aria-label": ariaLabel,
}: TreeListProps<T>) {
  const roots = buildTree(items, compare);
  if (roots.length === 0) return <>{empty}</>;

  const renderNode = (node: TreeNode<T>): ReactNode => (
    <Box component="li" key={node.item.id} role="treeitem" aria-level={node.depth + 1}>
      <Group
        justify="space-between"
        wrap="nowrap"
        py={4}
        pl={node.depth * 24}
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
      >
        <Text size="sm" component="div">
          {label(node.item)}
        </Text>
        {actions && (
          <Group gap={4} wrap="nowrap">
            {actions(node.item)}
          </Group>
        )}
      </Group>
      {node.children.length > 0 && (
        <Box component="ul" role="group" m={0} p={0} style={{ listStyle: "none" }}>
          {node.children.map(renderNode)}
        </Box>
      )}
    </Box>
  );

  return (
    <Box
      component="ul"
      role="tree"
      aria-label={ariaLabel}
      m={0}
      p={0}
      style={{ listStyle: "none" }}
    >
      {roots.map(renderNode)}
    </Box>
  );
}
