"""Wikilink parser (ADR-0024, ADR-0036): `[[type:uuid|label]]`, ignored inside code."""

import re
import uuid
from dataclasses import dataclass
from enum import StrEnum


class LinkType(StrEnum):
    """Entities a wikilink or an attachment may point to."""

    DOCUMENT = "document"
    MISSION = "mission"
    DOMAIN = "domain"
    ARCHITECTURE = "architecture"
    CONTACT = "contact"
    COMPANY = "company"
    SUBJECT = "subject"
    TECHNOLOGY = "technology"


_TYPES = "|".join(t.value for t in LinkType)
WIKILINK = re.compile(
    rf"\[\[(?P<type>{_TYPES}):(?P<id>[0-9a-fA-F]{{8}}-[0-9a-fA-F]{{4}}-[0-9a-fA-F]{{4}}"
    rf"-[0-9a-fA-F]{{4}}-[0-9a-fA-F]{{12}})(?:\|(?P<label>[^\]\n|]*))?\]\]"
)
_FENCE = re.compile(r"^ {0,3}(?P<marker>`{3,}|~{3,})")
_INLINE_CODE = re.compile(r"(`+)(?:(?!\1).)+?\1")


@dataclass(frozen=True)
class WikiLink:
    type: LinkType
    id: uuid.UUID
    label: str


def _without_inline_code(line: str) -> str:
    return _INLINE_CODE.sub(lambda m: " " * len(m.group(0)), line)


def extract(markdown: str) -> list[WikiLink]:
    """Distinct wikilinks in reading order; the first label of a target wins."""
    found: dict[tuple[LinkType, uuid.UUID], WikiLink] = {}
    fence: str | None = None
    for line in markdown.splitlines():
        match = _FENCE.match(line)
        if fence is not None:
            # A fence closes with the same character, at least as long as the opening.
            if (
                match
                and match.group("marker")[0] == fence[0]
                and len(match.group("marker")) >= len(fence)
                and not line.strip()[len(match.group("marker")) :].strip()
            ):
                fence = None
            continue
        if match:
            fence = match.group("marker")
            continue
        for link in WIKILINK.finditer(_without_inline_code(line)):
            key = (LinkType(link.group("type")), uuid.UUID(link.group("id")))
            if key not in found:
                label = (link.group("label") or "").strip()
                found[key] = WikiLink(type=key[0], id=key[1], label=label)
    return list(found.values())
