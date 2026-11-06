import "@xyflow/react/dist/style.css";

import {
  Anchor,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconFileExport,
  IconLayoutDistributeHorizontal,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type NodeChange,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useNotify } from "../directory/useNotify";
import { NotFoundPage } from "../placeholder/NotFoundPage";
import {
  type ArchitectureDetail,
  DOMAIN_KINDS,
  type Graph,
  useArchitecture,
  useGraph,
  useLayout,
  useResetLayout,
  useSaveLayout,
} from "./api";
import { DomainForm } from "./DomainForm";
import { ExportPanel } from "./ExportPanel";
import {
  buildModel,
  type ElkNode,
  elkGraph,
  type GraphView,
  matches,
  type ModelNode,
  neighbours,
  placements,
} from "./graphModel";
import { type DomainFlowNode, DomainNode, GroupNode } from "./GraphNodes";
import { RelationModal } from "./RelationModal";

const elk = new ELK();
const NODE_TYPES = { domain: DomainNode, group: GroupNode };
const CHANGE_COLORS = {
  added: "var(--mantine-color-green-6)",
  removed: "var(--mantine-color-gray-5)",
};

/** Parents before children: React Flow requires it for nested nodes. */
function byLevel(nodes: readonly ModelNode[]): ModelNode[] {
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  const level = (id: string): number => {
    let depth = 0;
    for (let p = parent.get(id); p; p = parent.get(p) ?? null) depth += 1;
    return depth;
  };
  return [...nodes].sort((a, b) => level(a.id) - level(b.id));
}

function GraphView({ architecture, graph }: { architecture: ArchitectureDetail; graph: Graph }) {
  const { t } = useTranslation("architecture");
  const notify = useNotify();
  const navigate = useNavigate();
  const layout = useLayout(architecture.id);
  const saveLayout = useSaveLayout(architecture.id);
  const resetLayout = useResetLayout(architecture.id);
  const [view, setView] = useState<GraphView>("CURRENT");
  const [kinds, setKinds] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [maxDepth, setMaxDepth] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ source: string; target: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [elkLayout, setElkLayout] = useState<ElkNode | null>(null);
  // Positions dragged during this visit (saved positions and ELK give the others).
  const [moved, setMoved] = useState<Map<string, { x: number; y: number }>>(new Map());
  const flow = useRef<ReactFlowInstance<DomainFlowNode> | null>(null);

  const model = buildModel(graph, {
    view,
    kinds: new Set(kinds),
    owners: new Set(owners),
    maxDepth,
    collapsed,
  });
  const structure = JSON.stringify([
    model.nodes.map((n) => [n.id, n.parentId, n.isGroup]),
    model.edges.map((e) => e.id),
  ]);

  // Automatic layout (ELK) each time the visible structure changes.
  useEffect(() => {
    let current = true;
    elk.layout(elkGraph(model.nodes, model.edges) as never).then(
      (result) => current && setElkLayout(result as unknown as ElkNode),
      () => current && setElkLayout({ id: "root", children: [] }),
    );
    return () => {
      current = false;
    };
    // The structure key captures what the layout depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure]);

  const hits = matches(model.nodes, search);
  const related = neighbours(model.edges, selected);
  const focus = search.trim() ? hits : related;
  const saved = new Map((layout.data ?? []).map((p) => [p.domain_id, p]));

  const toggle = (id: string) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const placed = elkLayout ? placements(elkLayout, saved) : new Map();
  const nodes: DomainFlowNode[] = byLevel(model.nodes).map((domain) => {
    const place = placed.get(domain.id) ?? { x: 0, y: 0, width: 200, height: 64 };
    return {
      id: domain.id,
      type: domain.isGroup ? "group" : "domain",
      parentId: domain.parentId ?? undefined,
      position: moved.get(domain.id) ?? { x: place.x, y: place.y },
      width: place.width,
      height: place.height,
      style: { width: place.width, height: place.height },
      selected: domain.id === selected,
      data: {
        domain,
        highlighted: focus.has(domain.id),
        dimmed: focus.size > 0 && !focus.has(domain.id),
        onToggle: toggle,
      },
    };
  });

  useEffect(() => {
    if (search.trim() && hits.size) {
      void flow.current?.fitView({
        nodes: [...hits].map((id) => ({ id })),
        duration: 300,
        maxZoom: 1.2,
      });
    }
    // Only when the query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const edges: Edge[] = model.edges.map((edge) => {
    const verb = edge.label ?? t(`relationTypes.${edge.type}`);
    const color = edge.change ? CHANGE_COLORS[edge.change] : undefined;
    return {
      id: edge.aggregated ? `${edge.source}>${edge.target}` : edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.protocol ? `${verb} (${edge.protocol})` : verb,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: {
        stroke: color,
        strokeDasharray: edge.sync_mode === "ASYNC" || edge.change ? "6 4" : undefined,
        strokeWidth: related.has(edge.source) && related.has(edge.target) && selected ? 2.5 : 1.5,
        opacity: focus.size > 0 && !(focus.has(edge.source) && focus.has(edge.target)) ? 0.25 : 1,
      },
    };
  });
  const teamOptions = [
    ...new Map(graph.nodes.filter((n) => n.owner).map((n) => [n.owner!.id, n.owner!.name])),
  ].map(([value, label]) => ({ value, label }));

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/architecture">
          {t("title")}
        </Anchor>
        <Anchor component={Link} to={`/architecture/architectures/${architecture.id}`}>
          {architecture.name}
        </Anchor>
        <Text>{t("graph.title")}</Text>
      </Breadcrumbs>
      <Group justify="space-between">
        <Title order={2}>{t("graph.heading", { name: architecture.name })}</Title>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >
            {t("domains.create")}
          </Button>
          <Button
            variant="default"
            leftSection={<IconLayoutDistributeHorizontal size={16} />}
            onClick={() =>
              resetLayout.mutate(undefined, {
                onSuccess: () => setMoved(new Map()),
                onError: notify.error,
              })
            }
          >
            {t("graph.resetLayout")}
          </Button>
          <Button leftSection={<IconFileExport size={16} />} onClick={() => setExporting(true)}>
            {t("export.button")}
          </Button>
        </Group>
      </Group>
      <Group align="flex-end" gap="sm">
        <SegmentedControl
          aria-label={t("graph.view")}
          value={view}
          onChange={(value) => setView(value as GraphView)}
          data={(["CURRENT", "TARGET", "BOTH"] as const).map((v) => ({
            value: v,
            label: t(`graph.views.${v}`),
          }))}
        />
        <MultiSelect
          label={t("graph.kinds")}
          placeholder={t("graph.allKinds")}
          data={DOMAIN_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          value={kinds}
          onChange={setKinds}
          clearable
          w={240}
        />
        <MultiSelect
          label={t("graph.teams")}
          placeholder={t("graph.allTeams")}
          data={teamOptions}
          value={owners}
          onChange={setOwners}
          clearable
          w={220}
        />
        <NumberInput
          label={t("graph.depth")}
          placeholder={t("graph.allLevels")}
          min={0}
          max={50}
          w={120}
          value={maxDepth ?? ""}
          onChange={(value) => setMaxDepth(typeof value === "number" ? value : null)}
        />
        <TextInput
          label={t("graph.search")}
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={200}
        />
      </Group>
      <Text size="xs" c="dimmed">
        {t("graph.help")}
      </Text>
      <Box
        h="70vh"
        style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}
      >
        {!elkLayout ? (
          <Loader m="md" size="sm" />
        ) : (
          <ReactFlow<DomainFlowNode>
            aria-label={t("graph.label")}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onInit={(instance) => {
              flow.current = instance;
            }}
            onNodesChange={(changes: NodeChange<DomainFlowNode>[]) => {
              const positions = changes.filter((c) => c.type === "position" && c.position);
              if (!positions.length) return;
              setMoved((current) => {
                const next = new Map(current);
                for (const change of positions) {
                  if (change.type === "position" && change.position)
                    next.set(change.id, change.position);
                }
                return next;
              });
            }}
            onNodeDragStop={(_, node) =>
              saveLayout.mutate([{ domain_id: node.id, x: node.position.x, y: node.position.y }], {
                onError: notify.error,
              })
            }
            onConnect={(connection: Connection) =>
              connection.source &&
              connection.target &&
              connection.source !== connection.target &&
              setDraft({ source: connection.source, target: connection.target })
            }
            onNodeClick={(_, node) => setSelected(node.id)}
            onNodeDoubleClick={(_, node) => void navigate(`/architecture/domains/${node.id}`)}
            onPaneClick={() => setSelected(null)}
            fitView
            minZoom={0.1}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        )}
      </Box>
      <Group gap="lg">
        <Text size="xs">— {t("graph.legend.sync")}</Text>
        <Text size="xs">- - {t("graph.legend.async")}</Text>
        {view === "BOTH" && (
          <>
            <Text size="xs" c="green">
              {t("graph.legend.added")}
            </Text>
            <Text size="xs" c="dimmed">
              {t("graph.legend.removed")}
            </Text>
          </>
        )}
      </Group>
      {draft && (
        <RelationModal
          companyId={architecture.company.id}
          domainId={draft.source}
          targetId={draft.target}
          onClose={() => setDraft(null)}
        />
      )}
      {creating && (
        <DomainForm
          companyId={architecture.company.id}
          architectureId={architecture.id}
          onCreated={() => setCreating(false)}
          onClose={() => setCreating(false)}
        />
      )}
      {exporting && (
        <ExportPanel
          architectureId={architecture.id}
          name={architecture.name}
          view={view}
          onClose={() => setExporting(false)}
        />
      )}
    </Stack>
  );
}

/** /architecture/architectures/:architectureId/graph (P9). */
export function GraphPage() {
  const { architectureId = "" } = useParams();
  const architecture = useArchitecture(architectureId);
  const graph = useGraph(architectureId);
  if (architecture.isPending || graph.isPending) return <Loader size="sm" />;
  if (!architecture.data || !graph.data) return <NotFoundPage />;
  return (
    <GraphView key={architecture.data.id} architecture={architecture.data} graph={graph.data} />
  );
}
