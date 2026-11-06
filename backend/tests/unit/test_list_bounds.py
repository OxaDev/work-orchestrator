"""Every list endpoint is paginated or bounded for a stated reason (P12-2, ADR-0041).

A new GET returning an array without `limit` fails here until it is paged (`limit`/`offset`
or `Page[T]`) or added below with the reason it cannot grow without bound.
"""

from app.core.config import Settings
from app.main import create_app

WHOLE = "a tree or a structure the UI shows whole"
RANGE = "bounded by a date range (at most 400 days) or a year"
SMALL = "a short shared referential"
ONE = "bounded by one entity"

BOUNDED: dict[str, str] = {
    "/api/v1/agenda/compatibility": "a constant matrix",
    "/api/v1/agenda/half-days": RANGE,
    "/api/v1/agenda/months": RANGE,
    "/api/v1/agenda/public-holidays": RANGE,
    "/api/v1/agenda/tasks": RANGE,
    "/api/v1/agenda/subtypes": SMALL,
    "/api/v1/agenda/week-templates": "a handful of personal templates",
    "/api/v1/architectures": WHOLE,
    "/api/v1/architectures/{architecture_id}/layout": ONE,
    "/api/v1/backlinks": ONE,
    "/api/v1/companies/{company_id}/org-units": WHOLE,
    "/api/v1/contact-roles": SMALL,
    "/api/v1/contacts/duplicates": "capped by the matching rule",
    "/api/v1/document-templates": SMALL,
    "/api/v1/documents": WHOLE,
    "/api/v1/domains": WHOLE,
    "/api/v1/domains/{domain_id}/ancestors": ONE,
    "/api/v1/domains/{domain_id}/descendants": WHOLE,
    "/api/v1/external-links": ONE,
    "/api/v1/org-units/{unit_id}/ancestors": ONE,
    "/api/v1/org-units/{unit_id}/descendants": WHOLE,
    "/api/v1/sectors": WHOLE,
    "/api/v1/subject-categories": SMALL,
    "/api/v1/subjects": WHOLE,
    "/api/v1/tags": SMALL,
}


def test_unpaged_lists_are_bounded_on_purpose() -> None:
    spec = create_app(Settings(base_path="")).openapi()
    unpaged = set()
    for path, operations in spec["paths"].items():
        operation = operations.get("get")
        if not operation:
            continue
        schema = operation["responses"].get("200", {}).get("content", {})
        schema = schema.get("application/json", {}).get("schema", {})
        params = {parameter["name"] for parameter in operation.get("parameters", [])}
        if schema.get("type") == "array" and "limit" not in params:
            unpaged.add(path)
    assert unpaged == set(BOUNDED)
