"""Wikilink extraction (ADR-0024, ADR-0036): edge cases."""

import uuid

from app.modules.documents.service import slugify
from app.modules.documents.wikilinks import LinkType, extract

A = uuid.UUID("0190a8c4-0000-7000-8000-000000000001")
B = uuid.UUID("0190a8c4-0000-7000-8000-000000000002")


def test_extracts_type_id_and_label() -> None:
    links = extract(f"See [[mission:{A}|Bank mission]] and [[domain:{B}]].")
    assert [(link.type, link.id, link.label) for link in links] == [
        (LinkType.MISSION, A, "Bank mission"),
        (LinkType.DOMAIN, B, ""),
    ]


def test_duplicates_keep_the_first_label_and_order() -> None:
    links = extract(
        f"[[contact:{A}|Hugo]] then [[contact:{A}|H. Lefèvre]] then [[company:{B}|Bank]]"
    )
    assert [(link.id, link.label) for link in links] == [(A, "Hugo"), (B, "Bank")]


def test_same_id_with_two_types_gives_two_links() -> None:
    assert len(extract(f"[[document:{A}|x]] [[subject:{A}|y]]")) == 2


def test_ignores_fenced_and_inline_code() -> None:
    markdown = f"""Real: [[company:{A}|Bank]]

```markdown
[[mission:{B}|in a fence]]
```

~~~~
[[mission:{B}|tilde fence]]
```
still inside the tilde fence
~~~~

Inline `[[mission:{B}|code]]` and ``[[mission:{B}|double]]`` are ignored.
"""
    assert [link.id for link in extract(markdown)] == [A]


def test_unclosed_fence_hides_the_rest() -> None:
    assert extract(f"```\n[[mission:{A}|x]]") == []


def test_rejects_malformed_links() -> None:
    markdown = "\n".join(
        [
            f"[[unknown:{A}|x]]",  # unknown type
            "[[mission:not-a-uuid|x]]",
            f"[[mission:{A}|multi\nline]]",
            f"[mission:{A}|single bracket]",
            f"[[mission:{A}|a|b]]",  # a pipe inside the label
            f"[[MISSION:{A}|upper-case type]]",
        ]
    )
    assert extract(markdown) == []


def test_upper_case_uuid_and_trimmed_label() -> None:
    links = extract(f"[[technology:{str(A).upper()}|  Kafka  ]]")
    assert (links[0].id, links[0].label) == (A, "Kafka")


def test_slugify() -> None:
    assert slugify("Fiche domaine : Paiements (v2)") == "fiche-domaine-paiements-v2"
    assert slugify("Étonnement à l'arrivée") == "etonnement-a-l-arrivee"
    assert slugify("!!!") == "document"


def test_every_link_type_is_supported() -> None:
    """Since P8 every wikilink type can be attached to (ADR-0036, ADR-0037)."""
    import pytest

    from app.core.errors import AppError
    from app.modules.documents import entities

    for kind in LinkType:
        entities.supported(kind)
    original = entities.ENTITY_TYPES.pop(LinkType.DOMAIN)
    try:
        with pytest.raises(AppError) as error:
            entities.supported(LinkType.DOMAIN)
        assert error.value.code == "ENTITY_TYPE_NOT_SUPPORTED"
    finally:
        entities.ENTITY_TYPES[LinkType.DOMAIN] = original
