import { ActionIcon, Anchor, Box, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import { type DragEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { buildTree, byTitle, subtreeIds, type TreeNode } from "../../components/tree";
import { useNotify } from "../directory/useNotify";
import { type DocumentSummary, useRelocateDocument } from "./api";

/** A group of top-level pages: one project, or the unfiled pages (`projectId` null). */
export interface DocumentGroup {
  projectId: string | null;
  /** Heading; omitted when the tree shows a single project. */
  label?: ReactNode;
}

const MIME = "application/x-wo-document";

/**
 * Page tree sorted alphabetically at every level, with drag and drop (ADR-0042): drop a page on
 * another to nest it, or on a group's top-level zone to take it out (the group decides its
 * project). Keyboard users move pages with the "Parent page" field of the document.
 */
export function DocumentTree({
  documents,
  groups,
  onCreateChild,
  empty,
}: {
  documents: readonly DocumentSummary[];
  groups: readonly DocumentGroup[];
  onCreateChild: (parent: DocumentSummary) => void;
  empty?: ReactNode;
}) {
  const { t } = useTranslation("documents");
  const notify = useNotify();
  const relocate = useRelocateDocument();
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const forbidden = dragged ? subtreeIds(documents, dragged) : new Set<string>();
  const byId = new Map(documents.map((d) => [d.id, d]));

  const end = () => {
    setDragged(null);
    setOver(null);
  };
  const drop = (target: { parentId: string } | { projectId: string | null }) => {
    const id = dragged;
    end();
    if (!id) return;
    const document = byId.get(id);
    if (!document) return;
    if ("parentId" in target) {
      if (forbidden.has(target.parentId) || document.parent_id === target.parentId) return;
      relocate.mutate({ id, parentId: target.parentId }, { onError: notify.error });
    } else {
      if (!document.parent_id && document.project_id === target.projectId) return;
      relocate.mutate(
        { id, parentId: null, projectId: target.projectId },
        { onError: notify.error },
      );
    }
  };
  const allow = (key: string, valid: boolean) => (event: DragEvent) => {
    if (!dragged || !valid) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(key);
  };

  const renderNode = (node: TreeNode<DocumentSummary>): ReactNode => {
    const doc = node.item;
    const target = Boolean(dragged) && !forbidden.has(doc.id);
    return (
      <Box component="li" key={doc.id} role="treeitem" aria-level={node.depth + 1}>
        <Group
          justify="space-between"
          wrap="nowrap"
          py={4}
          pl={node.depth * 24}
          data-testid={`document-row-${doc.id}`}
          onDragOver={allow(doc.id, target)}
          onDragLeave={() => setOver((current) => (current === doc.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            drop({ parentId: doc.id });
          }}
          style={{
            borderBottom: "1px solid var(--mantine-color-default-border)",
            opacity: dragged === doc.id ? 0.5 : 1,
            background: over === doc.id ? "var(--mantine-primary-color-light)" : undefined,
            borderRadius: 4,
          }}
        >
          <Group gap={6} wrap="nowrap">
            <Box
              draggable
              aria-hidden
              data-testid={`document-drag-${doc.id}`}
              onDragStart={(event: DragEvent) => {
                event.dataTransfer.setData(MIME, doc.id);
                event.dataTransfer.effectAllowed = "move";
                setDragged(doc.id);
              }}
              onDragEnd={end}
              style={{ cursor: "grab", display: "flex", color: "var(--mantine-color-dimmed)" }}
            >
              <IconGripVertical size={14} />
            </Box>
            <Anchor
              component={Link}
              to={`/documents/${doc.id}`}
              size="sm"
              td={doc.archived_at ? "line-through" : undefined}
            >
              {doc.title}
            </Anchor>
            {doc.has_draft && (
              <Text size="xs" c="orange">
                {t("hasDraft")}
              </Text>
            )}
          </Group>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={t("createChild", { title: doc.title })}
            onClick={() => onCreateChild(doc)}
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
        {node.children.length > 0 && (
          <Box component="ul" role="group" m={0} p={0} style={{ listStyle: "none" }}>
            {node.children.map(renderNode)}
          </Box>
        )}
      </Box>
    );
  };

  if (documents.length === 0 && groups.every((g) => !g.label)) return <>{empty}</>;
  return (
    <Stack gap="md">
      {groups.map((group) => {
        const key = `root:${group.projectId ?? "none"}`;
        const roots = buildTree(
          documents.filter((d) => belongsTo(d, group.projectId, byId)),
          byTitle,
        );
        return (
          <Stack key={key} gap={4}>
            {group.label && <Title order={5}>{group.label}</Title>}
            {dragged && (
              <Paper
                withBorder
                p="xs"
                data-testid={`document-root-${group.projectId ?? "none"}`}
                onDragOver={allow(key, true)}
                onDragLeave={() => setOver((current) => (current === key ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  drop({ projectId: group.projectId });
                }}
                style={{
                  borderStyle: "dashed",
                  background: over === key ? "var(--mantine-primary-color-light)" : undefined,
                }}
              >
                <Text size="xs" c="dimmed">
                  {t("dnd.dropRoot")}
                </Text>
              </Paper>
            )}
            {roots.length ? (
              <Box
                component="ul"
                role="tree"
                aria-label={typeof group.label === "string" ? group.label : t("tree")}
                m={0}
                p={0}
                style={{ listStyle: "none" }}
              >
                {roots.map(renderNode)}
              </Box>
            ) : (
              group.label && (
                <Text size="sm" c="dimmed">
                  {t("dnd.emptyGroup")}
                </Text>
              )
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/** The project a page is shown under: its top-most listed ancestor's. */
function belongsTo(
  doc: DocumentSummary,
  projectId: string | null,
  byId: Map<string, DocumentSummary>,
): boolean {
  let current = doc;
  const seen = new Set<string>();
  while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parent_id)!;
  }
  return (current.project_id ?? null) === projectId;
}
