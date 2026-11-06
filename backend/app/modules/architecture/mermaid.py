"""Mermaid export of an architecture (ADR-0025, ADR-0038): `flowchart` and `mindmap`.

Pure functions over the P8 graph, so the export shows exactly what the graph view filters.
"""

import hashlib
import uuid
from collections import defaultdict

from app.modules.architecture.models import DomainKind, Lifecycle, RelationType, SyncMode
from app.modules.architecture.schemas import (
    Direction,
    ExportLanguage,
    Graph,
    GraphNode,
    GraphView,
)

INDENT = "    "

# Shape per kind: (opening, closing) around the quoted label.
SHAPES: dict[DomainKind, tuple[str, str]] = {
    DomainKind.BUSINESS_DOMAIN: ("(", ")"),
    DomainKind.APPLICATION: ("[", "]"),
    DomainKind.SERVICE: ("([", "])"),
    DomainKind.DATABASE: ("[(", ")]"),
    DomainKind.MESSAGING: ("[[", "]]"),
    DomainKind.EXTERNAL_SYSTEM: ("{{", "}}"),
    DomainKind.INFRASTRUCTURE: ("[/", "/]"),
    DomainKind.OTHER: ("[", "]"),
}

# Edge verbs: the export is a document written for the user, in their language (ADR-0038).
VERBS: dict[ExportLanguage, dict[RelationType, str]] = {
    ExportLanguage.FR: {
        RelationType.CALLS: "appelle",
        RelationType.DEPENDS_ON: "dépend de",
        RelationType.PUBLISHES_TO: "publie vers",
        RelationType.SUBSCRIBES_TO: "s'abonne à",
        RelationType.READS_FROM: "lit",
        RelationType.WRITES_TO: "écrit dans",
        RelationType.CUSTOM: "",
    },
    ExportLanguage.EN: {
        RelationType.CALLS: "calls",
        RelationType.DEPENDS_ON: "depends on",
        RelationType.PUBLISHES_TO: "publishes to",
        RelationType.SUBSCRIBES_TO: "subscribes to",
        RelationType.READS_FROM: "reads from",
        RelationType.WRITES_TO: "writes to",
        RelationType.CUSTOM: "",
    },
}

CLASS_DEFS = [
    "classDef added stroke:#2f9e44,stroke-width:2px,stroke-dasharray:5 3",
    "classDef removed fill:#f1f3f5,stroke:#868e96,color:#868e96,stroke-dasharray:3 3",
]


def node_ids(ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Stable short ids: 'd' + 8 hex digits of SHA-1, lengthened on collision."""
    result: dict[uuid.UUID, str] = {}
    used: set[str] = set()
    for node_id in sorted(ids):
        digest = hashlib.sha1(node_id.bytes, usedforsecurity=False).hexdigest()
        length = 8
        while f"d{digest[:length]}" in used:
            length += 2
        short = f"d{digest[:length]}"
        used.add(short)
        result[node_id] = short
    return result


def escape(text: str) -> str:
    """Label safe inside Mermaid quotes: entity codes for the characters Mermaid interprets."""
    flat = " ".join(text.split())
    return (
        flat.replace("#", "#35;")
        .replace('"', "#quot;")
        .replace("<", "#lt;")
        .replace(">", "#gt;")
        .replace("|", "#124;")
    )


def markdown_string(text: str) -> str:
    """Mindmap label as a Mermaid markdown string: no quote nor backtick, no HTML tag."""
    flat = " ".join(text.split()).replace("`", "'").replace('"', "'")
    return flat.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _children(graph: Graph) -> dict[uuid.UUID | None, list[GraphNode]]:
    children: dict[uuid.UUID | None, list[GraphNode]] = defaultdict(list)
    for node in graph.nodes:
        children[node.parent_id].append(node)
    for siblings in children.values():
        siblings.sort(key=lambda n: (n.name.casefold(), str(n.id)))
    return children


def _change_class(lifecycle: Lifecycle) -> str | None:
    return {Lifecycle.TARGET: "added", Lifecycle.DEPRECATED: "removed"}.get(lifecycle)


def flowchart(
    graph: Graph,
    *,
    direction: Direction = Direction.LR,
    view: GraphView = GraphView.CURRENT,
    lang: ExportLanguage = ExportLanguage.FR,
) -> str:
    ids = node_ids([n.id for n in graph.nodes])
    children = _children(graph)
    lines = [f"%% {escape(graph.architecture.name)}", f"flowchart {direction.value}"]

    def emit(node: GraphNode, level: int) -> None:
        pad = INDENT * level
        label = escape(node.name)
        if children.get(node.id):
            lines.append(f'{pad}subgraph {ids[node.id]}["{label}"]')
            for child in children[node.id]:
                emit(child, level + 1)
            lines.append(f"{pad}end")
        else:
            opening, closing = SHAPES[node.kind]
            lines.append(f'{pad}{ids[node.id]}{opening}"{label}"{closing}')

    for root in children.get(None, []):
        emit(root, 1)

    parents = {n.id: n.parent_id for n in graph.nodes}

    def lineage(node_id: uuid.UUID) -> set[uuid.UUID]:
        result: set[uuid.UUID] = set()
        parent = parents.get(node_id)
        while parent is not None:
            result.add(parent)
            parent = parents.get(parent)
        return result

    verbs = VERBS[lang]
    changed_edges: list[tuple[int, str]] = []
    index = -1
    for edge in graph.edges:
        text = edge.label or verbs[edge.type] or edge.type.value
        if edge.protocol:
            text = f"{text} ({edge.protocol})"
        if edge.target_id in lineage(edge.source_id) or edge.source_id in lineage(edge.target_id):
            # Mermaid cannot draw a link between a subgraph and its own content: kept as a note.
            lines.append(
                f"{INDENT}%% {ids[edge.source_id]} → {ids[edge.target_id]}: {escape(text)}"
            )
            continue
        index += 1
        arrow = "-.->" if edge.sync_mode == SyncMode.ASYNC else "-->"
        lines.append(
            f'{INDENT}{ids[edge.source_id]} {arrow}|"{escape(text)}"| {ids[edge.target_id]}'
        )
        if view == GraphView.BOTH and (change := _change_class(edge.lifecycle)):
            changed_edges.append((index, change))

    if view == GraphView.BOTH:
        lines.extend(f"{INDENT}{definition}" for definition in CLASS_DEFS)
        for change in ("added", "removed"):
            members = sorted(ids[n.id] for n in graph.nodes if _change_class(n.lifecycle) == change)
            if members:
                lines.append(f"{INDENT}class {','.join(members)} {change}")
        styles = {
            "added": "stroke:#2f9e44,stroke-dasharray:5 3",
            "removed": "stroke:#868e96,stroke-dasharray:3 3",
        }
        lines.extend(
            f"{INDENT}linkStyle {index} {styles[change]}" for index, change in changed_edges
        )
    return "\n".join(lines) + "\n"


def mindmap(graph: Graph) -> str:
    """The domain tree under the architecture (Q-H10)."""
    ids = node_ids([n.id for n in graph.nodes])
    children = _children(graph)
    lines = ["mindmap", f'{INDENT}root(("`{markdown_string(graph.architecture.name)}`"))']

    def emit(node: GraphNode, level: int) -> None:
        lines.append(f'{INDENT * level}{ids[node.id]}["`{markdown_string(node.name)}`"]')
        for child in children.get(node.id, []):
            emit(child, level + 1)

    for root in children.get(None, []):
        emit(root, 2)
    return "\n".join(lines) + "\n"
