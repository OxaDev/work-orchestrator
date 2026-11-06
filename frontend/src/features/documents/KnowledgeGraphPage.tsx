import "@xyflow/react/dist/style.css";

import { Anchor, Badge, Box, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { entityPath, type LinkType } from "../../components/markdown";
import { type KnowledgeGraph, useKnowledgeGraph } from "./api";

const elk = new ELK();
const WIDTH = 170;
const HEIGHT = 40;
const COLORS: Record<LinkType, string> = {
  document: "blue",
  mission: "teal",
  domain: "violet",
  architecture: "grape",
  contact: "orange",
  company: "cyan",
  subject: "lime",
  technology: "pink",
};

type EntityNode = Node<{ type: LinkType; label: string }, "entity">;

function EntityCard({ data }: NodeProps<EntityNode>) {
  const { t } = useTranslation("documents");
  return (
    <Paper
      withBorder
      px={6}
      py={4}
      radius="xl"
      w={WIDTH}
      aria-label={`${t(`types.${data.type}`)} ${data.label}`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Group gap={4} wrap="nowrap">
        <Badge size="xs" color={COLORS[data.type]} variant="light">
          {t(`types.${data.type}`)}
        </Badge>
        <Text size="xs" truncate>
          {data.label}
        </Text>
      </Group>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </Paper>
  );
}

const NODE_TYPES = { entity: EntityCard };
const key = (type: string, id: string) => `${type}:${id}`;

/** ELK "stress" places linked items close to each other, like a note graph. */
async function layout(graph: KnowledgeGraph): Promise<Map<string, { x: number; y: number }>> {
  const result = await elk.layout({
    id: "root",
    layoutOptions: { "elk.algorithm": "stress", "elk.stress.desiredEdgeLength": "180" },
    children: graph.nodes.map((n) => ({ id: key(n.type, n.id), width: WIDTH, height: HEIGHT })),
    edges: graph.edges.map((e, i) => ({
      id: `e${i}`,
      sources: [key(e.source_type, e.source_id)],
      targets: [key(e.target_type, e.target_id)],
    })),
  });
  return new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}

/** /documents/graph — documents and the entities they cite, Obsidian-like (P9-12). */
export function KnowledgeGraphPage() {
  const { t } = useTranslation("documents");
  const navigate = useNavigate();
  const graph = useKnowledgeGraph();
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }> | null>(null);

  useEffect(() => {
    if (!graph.data) return;
    let current = true;
    layout(graph.data).then(
      (placed) => current && setPositions(placed),
      () => current && setPositions(new Map()),
    );
    return () => {
      current = false;
    };
  }, [graph.data]);

  const data = graph.data;
  const nodes: EntityNode[] = (data?.nodes ?? []).map((n) => ({
    id: key(n.type, n.id),
    type: "entity",
    position: positions?.get(key(n.type, n.id)) ?? { x: 0, y: 0 },
    data: { type: n.type, label: n.label },
  }));
  const edges: Edge[] = (data?.edges ?? []).map((e, i) => ({
    id: `e${i}`,
    source: key(e.source_type, e.source_id),
    target: key(e.target_type, e.target_id),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeDasharray: e.kind === "ATTACHMENT" ? "6 4" : undefined },
  }));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("graph.title")}</Title>
        <Anchor component={Link} to="/documents" size="sm">
          {t("title")}
        </Anchor>
      </Group>
      <Text size="sm" c="dimmed">
        {t("graph.help")}
      </Text>
      <Box
        h="70vh"
        style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}
      >
        {!data || !positions ? (
          <Loader m="md" size="sm" />
        ) : data.nodes.length === 0 ? (
          <Text m="md" size="sm" c="dimmed">
            {t("graph.empty")}
          </Text>
        ) : (
          <ReactFlow<EntityNode>
            aria-label={t("graph.title")}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            nodesConnectable={false}
            onNodeClick={(_, node) =>
              void navigate(entityPath(node.data.type, node.id.split(":")[1]!, node.data.label))
            }
            fitView
            minZoom={0.1}
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}
      </Box>
      <Group gap="lg">
        <Text size="xs">— {t("graph.legendLink")}</Text>
        <Text size="xs">- - {t("graph.legendAttachment")}</Text>
      </Group>
    </Stack>
  );
}
