"""Searchable tables (ADR-0026, ADR-0040): one place for the migration and the queries.

Each table gets a generated `search_vector` (French + English, unaccented, title weight A,
body weight B) and a GIN index; names also get a trigram index for typo tolerance.
"""

from dataclasses import dataclass
from enum import StrEnum


class SearchType(StrEnum):
    DOCUMENT = "document"
    DAILY_LOG = "daily_log"
    TASK = "task"
    SUBJECT = "subject"
    DOMAIN = "domain"
    ARCHITECTURE = "architecture"
    MISSION = "mission"
    CONTACT = "contact"
    COMPANY = "company"
    TECHNOLOGY = "technology"


@dataclass(frozen=True)
class Searchable:
    table: str
    # SQL expressions over the table's own columns.
    title: str
    body: list[str]
    owned: bool
    # Expression compared by trigram similarity (names), when typos must be tolerated.
    name: str | None = None
    archivable: bool = True


SEARCHABLES: dict[SearchType, Searchable] = {
    SearchType.DOCUMENT: Searchable("documents", "title", ["content_md"], owned=True),
    SearchType.DAILY_LOG: Searchable(
        # No title: a date cast to text is not immutable; the date is shown with the result.
        "daily_logs",
        "NULL",
        ["done", "planned", "blockers"],
        owned=True,
        archivable=False,
    ),
    SearchType.TASK: Searchable(
        "tasks", "title", ["description", "external_ref"], owned=True, archivable=False
    ),
    SearchType.SUBJECT: Searchable("subjects", "title", ["description"], owned=True),
    SearchType.DOMAIN: Searchable("domains", "name", ["description"], owned=True),
    SearchType.ARCHITECTURE: Searchable("architectures", "name", ["description"], owned=True),
    SearchType.MISSION: Searchable(
        "missions", "title || ' ' || job_title", ["objectives", "description", "review"], owned=True
    ),
    SearchType.CONTACT: Searchable(
        "contacts",
        "first_name || ' ' || last_name || ' ' || coalesce(job_title, '')",
        ["notes"],
        owned=False,
        name="first_name || ' ' || last_name",
    ),
    SearchType.COMPANY: Searchable("companies", "name", ["notes"], owned=False, name="name"),
    SearchType.TECHNOLOGY: Searchable(
        "technologies", "name", ["description"], owned=False, name="name"
    ),
}


def _vector(expression: str, weight: str) -> str:
    text = f"f_unaccent(coalesce({expression}, ''))"
    return (
        f"setweight(to_tsvector('french', {text}), '{weight}') || "
        f"setweight(to_tsvector('english', {text}), '{weight}')"
    )


def vector_expression(searchable: Searchable) -> str:
    """The generated column's expression (immutable functions only)."""
    parts = [_vector(searchable.title, "A")] + [_vector(body, "B") for body in searchable.body]
    return " || ".join(parts)


def search_index(table: str) -> str:
    return f"ix_{table}_search"


def trigram_index(table: str) -> str:
    return f"ix_{table}_name_trgm"
