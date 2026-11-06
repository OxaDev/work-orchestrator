"""Mermaid export (P9-1 to P9-4, ADR-0025, ADR-0038): snapshots and edge cases.

Snapshots live in `tests/unit/snapshots/`; the frontend parses every one of them with the real
Mermaid parser (`graph.test.tsx`). Regenerate after an intended change with
`UPDATE_SNAPSHOTS=1 uv run pytest tests/unit/test_mermaid.py`.
"""

import hashlib
import os
import uuid
from pathlib import Path
from typing import Any

import pytest

from app.modules.architecture import mermaid
from app.modules.architecture.models import (
    Criticality,
    DomainKind,
    Lifecycle,
    RelationType,
    SyncMode,
)
from app.modules.architecture.schemas import (
    Direction,
    ExportLanguage,
    Graph,
    GraphEdge,
    GraphNode,
    GraphView,
)
from app.modules.directory.schemas import Summary

SNAPSHOTS = Path(__file__).parent / "snapshots"


def uid(n: int) -> uuid.UUID:
    return uuid.UUID(int=n)


def node(n: int, name: str, kind: DomainKind, parent: int | None = None, **extra: Any) -> GraphNode:
    return GraphNode(
        id=uid(n),
        parent_id=uid(parent) if parent else None,
        name=name,
        kind=kind,
        lifecycle=extra.get("lifecycle", Lifecycle.CURRENT),
        criticality=extra.get("criticality"),
        depth=0 if parent is None else 1,
        member=parent is None,
        owner=None,
    )


def edge(n: int, source: int, target: int, kind: RelationType, **extra: Any) -> GraphEdge:
    return GraphEdge(
        id=uid(1000 + n),
        source_id=uid(source),
        target_id=uid(target),
        type=kind,
        label=extra.get("label"),
        protocol=extra.get("protocol"),
        sync_mode=extra.get("sync_mode"),
        lifecycle=extra.get("lifecycle", Lifecycle.CURRENT),
    )


SMALL = Graph(
    architecture=Summary(id=uid(999), name='SI "Horizon" <v2> #1'),
    nodes=[
        node(1, "Paiements", DomainKind.BUSINESS_DOMAIN),
        node(2, "Hub | paiements", DomainKind.APPLICATION, 1, criticality=Criticality.HIGH),
        node(3, "API", DomainKind.SERVICE, 2),
        node(4, "Base\nPaiements", DomainKind.DATABASE, 2),
        node(5, "Topic", DomainKind.MESSAGING, 1, lifecycle=Lifecycle.TARGET),
        node(6, "SWIFT", DomainKind.EXTERNAL_SYSTEM),
        node(7, "Kubernetes", DomainKind.INFRASTRUCTURE),
        node(8, "Legacy batch", DomainKind.OTHER, lifecycle=Lifecycle.DEPRECATED),
    ],
    edges=[
        edge(1, 3, 4, RelationType.WRITES_TO, protocol="JDBC", sync_mode=SyncMode.SYNC),
        edge(
            2,
            3,
            5,
            RelationType.PUBLISHES_TO,
            protocol="Kafka",
            sync_mode=SyncMode.ASYNC,
            lifecycle=Lifecycle.TARGET,
        ),
        edge(3, 2, 6, RelationType.CUSTOM, label="envoie les virements >1 M€"),
        edge(4, 8, 4, RelationType.READS_FROM, lifecycle=Lifecycle.DEPRECATED),
        edge(5, 2, 1, RelationType.DEPENDS_ON),
    ],
)


def fifty_domains() -> Graph:
    """The DoD case: 5 business domains, 5 applications, 40 components, 66 relations."""
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    kinds = [
        DomainKind.SERVICE,
        DomainKind.DATABASE,
        DomainKind.MESSAGING,
        DomainKind.EXTERNAL_SYSTEM,
    ]
    number = 0
    for b in range(5):
        business = 100 * (b + 1)
        nodes.append(node(business, f"Domaine {b + 1}", DomainKind.BUSINESS_DOMAIN))
        nodes.append(node(business + 1, f"Application {b + 1}", DomainKind.APPLICATION, business))
        for c in range(8):
            nodes.append(
                node(business + 10 + c, f"Composant {b + 1}.{c + 1}", kinds[c % 4], business + 1)
            )
            number += 1
            edges.append(
                edge(number, business + 1, business + 10 + c, RelationType.CALLS, protocol="REST")
            )
        number += 1
        edges.append(
            edge(
                number,
                business + 10,
                100 * ((b + 1) % 5 + 1) + 11,
                RelationType.PUBLISHES_TO,
                sync_mode=SyncMode.ASYNC,
            )
        )
        number += 1
        edges.append(
            edge(number, business + 1, 100 * ((b + 2) % 5 + 1) + 1, RelationType.DEPENDS_ON)
        )
        number += 1
        edges.append(
            edge(
                number,
                business + 12,
                business + 13,
                RelationType.SUBSCRIBES_TO,
                sync_mode=SyncMode.ASYNC,
            )
        )
        number += 1
        edges.append(
            edge(number, business + 14, business + 11, RelationType.READS_FROM, protocol="SQL")
        )
        number += 1
        edges.append(edge(number, business + 15, business + 11, RelationType.WRITES_TO))
    assert len(nodes) == 50
    return Graph(
        architecture=Summary(id=uid(5000), name="SI à 50 domaines"), nodes=nodes, edges=edges
    )


def check_snapshot(name: str, code: str) -> None:
    path = SNAPSHOTS / f"{name}.mmd"
    if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not path.exists():
        SNAPSHOTS.mkdir(exist_ok=True)
        path.write_text(code, encoding="utf-8")
    assert code == path.read_text(encoding="utf-8")


def test_flowchart_snapshot() -> None:
    check_snapshot("flowchart_current_fr", mermaid.flowchart(SMALL))


def test_flowchart_both_views_snapshot() -> None:
    code = mermaid.flowchart(
        SMALL, direction=Direction.TB, view=GraphView.BOTH, lang=ExportLanguage.EN
    )
    check_snapshot("flowchart_both_en", code)


def test_mindmap_snapshot() -> None:
    check_snapshot("mindmap", mermaid.mindmap(SMALL))


def test_fifty_domains_snapshot() -> None:
    graph = fifty_domains()
    code = mermaid.flowchart(graph)
    check_snapshot("flowchart_fifty_domains", code)
    assert code.count("subgraph ") == 10  # 5 business domains + 5 applications
    assert code.count("-.->") == 10
    check_snapshot("mindmap_fifty_domains", mermaid.mindmap(graph))


def test_flowchart_structure() -> None:
    code = mermaid.flowchart(SMALL)
    lines = code.splitlines()
    ids = mermaid.node_ids([n.id for n in SMALL.nodes])
    assert lines[:2] == ["%% SI #quot;Horizon#quot; #lt;v2#gt; #35;1", "flowchart LR"]
    # Domains with children are subgraphs; leaves carry the shape of their kind.
    assert f'    subgraph {ids[uid(1)]}["Paiements"]' in lines
    assert f'        subgraph {ids[uid(2)]}["Hub #124; paiements"]' in lines
    assert f'            {ids[uid(3)]}(["API"])' in lines
    assert f'            {ids[uid(4)]}[("Base Paiements")]' in lines
    assert f'        {ids[uid(5)]}[["Topic"]]' in lines
    assert f'    {ids[uid(6)]}{{{{"SWIFT"}}}}' in lines
    assert f'    {ids[uid(7)]}[/"Kubernetes"/]' in lines
    # Async edges are dashed; labels: custom label, else verb, plus protocol.
    assert f'    {ids[uid(3)]} -->|"écrit dans (JDBC)"| {ids[uid(4)]}' in lines
    assert f'    {ids[uid(3)]} -.->|"publie vers (Kafka)"| {ids[uid(5)]}' in lines
    assert f'    {ids[uid(2)]} -->|"envoie les virements #gt;1 M€"| {ids[uid(6)]}' in lines
    # A link between a subgraph and its own content cannot be drawn: kept as a comment.
    assert f"    %% {ids[uid(2)]} → {ids[uid(1)]}: dépend de" in lines
    # No change markers outside the "both" view.
    assert "classDef" not in code


def test_both_view_marks_changes() -> None:
    code = mermaid.flowchart(SMALL, view=GraphView.BOTH, lang=ExportLanguage.EN)
    ids = mermaid.node_ids([n.id for n in SMALL.nodes])
    assert f"    class {ids[uid(5)]} added" in code
    assert f"    class {ids[uid(8)]} removed" in code
    assert "    linkStyle 1 stroke:#2f9e44,stroke-dasharray:5 3" in code
    assert "    linkStyle 3 stroke:#868e96,stroke-dasharray:3 3" in code
    assert '"reads from"' in code


def test_ids_are_stable_and_unique(monkeypatch: pytest.MonkeyPatch) -> None:
    ids = [uuid.uuid4() for _ in range(500)]
    first = mermaid.node_ids(ids)
    assert first == mermaid.node_ids(list(reversed(ids)))
    assert len(set(first.values())) == 500
    assert all(value.startswith("d") and len(value) == 9 for value in first.values())

    class Same:
        def hexdigest(self) -> str:
            return "ab" * 20

    monkeypatch.setattr(hashlib, "sha1", lambda *_args, **_kwargs: Same())
    collided = mermaid.node_ids([uid(1), uid(2), uid(3)])
    assert sorted(collided.values()) == ["dabababab", "dababababab", "dababababababab"[:13]]


def test_escaping() -> None:
    assert mermaid.escape('a "b" <c> #d | e\n f') == "a #quot;b#quot; #lt;c#gt; #35;d #124; e f"
    assert mermaid.markdown_string('a "b" `c`\nd <e> & f') == "a 'b' 'c' d &lt;e&gt; &amp; f"


def test_empty_graph() -> None:
    empty = Graph(architecture=Summary(id=uid(1), name="Vide"), nodes=[], edges=[])
    assert mermaid.flowchart(empty) == "%% Vide\nflowchart LR\n"
    assert mermaid.mindmap(empty) == 'mindmap\n    root(("`Vide`"))\n'
