import { ActionIcon, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useTranslation } from "react-i18next";

import type { ModelNode } from "./graphModel";
import { CRITICALITY_COLORS, KIND_ICONS } from "./kinds";

export interface DomainNodeData extends Record<string, unknown> {
  domain: ModelNode;
  /** Search hit or neighbour of the selection. */
  highlighted: boolean;
  /** Something is selected or searched and this node is not part of it. */
  dimmed: boolean;
  onToggle: (id: string) => void;
}

export type DomainFlowNode = Node<DomainNodeData, "domain" | "group">;

const CHANGE_STYLES = {
  added: { borderColor: "var(--mantine-color-green-6)", borderStyle: "dashed" },
  removed: { borderColor: "var(--mantine-color-gray-5)", borderStyle: "dashed", opacity: 0.7 },
} as const;

function ToggleButton({ domain, onToggle }: { domain: ModelNode; onToggle: (id: string) => void }) {
  const { t } = useTranslation("architecture");
  return (
    <ActionIcon
      size="xs"
      variant="subtle"
      className="nodrag"
      aria-label={t(domain.collapsed ? "graph.expand" : "graph.collapse", { name: domain.name })}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(domain.id);
      }}
    >
      {domain.collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
    </ActionIcon>
  );
}

/** A leaf (or collapsed group) domain card (P9-6). */
export function DomainNode({ data, selected }: NodeProps<DomainFlowNode>) {
  const { t } = useTranslation("architecture");
  const { domain } = data;
  const Icon = KIND_ICONS[domain.kind];
  return (
    <Paper
      withBorder
      p={6}
      radius="sm"
      w="100%"
      h="100%"
      role="group"
      aria-label={`${t(`kinds.${domain.kind}`)} ${domain.name}`}
      style={{
        ...(domain.change ? CHANGE_STYLES[domain.change] : {}),
        borderWidth: selected || data.highlighted ? 2 : 1,
        ...(selected || data.highlighted ? { borderColor: "var(--mantine-color-blue-6)" } : {}),
        opacity: data.dimmed ? 0.35 : domain.change === "removed" ? 0.7 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Stack gap={2}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Icon size={16} stroke={1.6} />
            <Text
              size="sm"
              fw={600}
              truncate
              td={domain.change === "removed" ? "line-through" : undefined}
            >
              {domain.name}
            </Text>
          </Group>
          {domain.collapsed && <ToggleButton domain={domain} onToggle={data.onToggle} />}
        </Group>
        <Group gap={4} wrap="nowrap">
          {domain.owner && (
            <Text size="xs" c="dimmed" truncate>
              {domain.owner.name}
            </Text>
          )}
          {domain.criticality && (
            <Badge size="xs" variant="light" color={CRITICALITY_COLORS[domain.criticality]}>
              {t(`criticalities.${domain.criticality}`)}
            </Badge>
          )}
          {domain.collapsed && (
            <Badge size="xs" variant="outline" color="gray">
              {t("graph.hidden", { count: domain.hiddenCount })}
            </Badge>
          )}
          {domain.change && (
            <Badge size="xs" color={domain.change === "added" ? "green" : "gray"}>
              {t(`graph.changes.${domain.change}`)}
            </Badge>
          )}
        </Group>
      </Stack>
      <Handle type="source" position={Position.Right} />
    </Paper>
  );
}

/** An expanded domain holding sub-domains (P9-5). */
export function GroupNode({ data }: NodeProps<DomainFlowNode>) {
  const { t } = useTranslation("architecture");
  const { domain } = data;
  const Icon = KIND_ICONS[domain.kind];
  return (
    <div
      role="group"
      aria-label={`${t(`kinds.${domain.kind}`)} ${domain.name}`}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 8,
        border: "1px solid var(--mantine-color-default-border)",
        background: "color-mix(in srgb, var(--mantine-color-blue-light) 40%, transparent)",
        opacity: data.dimmed ? 0.5 : 1,
        ...(domain.change ? CHANGE_STYLES[domain.change] : {}),
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Group gap={6} p={6} wrap="nowrap">
        <ToggleButton domain={domain} onToggle={data.onToggle} />
        <Icon size={14} stroke={1.6} />
        <Text size="xs" fw={700} truncate>
          {domain.name}
        </Text>
      </Group>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
