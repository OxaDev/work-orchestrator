"""Mission dashboard and career (P10, ADR-0039): aggregates on a known dataset (P10-8)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import FrozenClock
from tests.integration.test_subjects import post

TASKS = "/api/v1/agenda/tasks"


@pytest.fixture
def today(clock: FrozenClock) -> str:
    clock.now = datetime(2026, 3, 4, 10, tzinfo=UTC)  # a Wednesday
    return "2026-03-04"


async def task(
    client: AsyncClient, subject: str, day: str, period: str, minutes: int, title: str
) -> str:
    created = await post(
        client,
        TASKS,
        {
            "date": day,
            "period": period,
            "subject_id": subject,
            "title": title,
            "duration_minutes": minutes,
        },
    )
    return str(created["task"]["id"])


@pytest.fixture
async def data(user_client: AsyncClient, today: str) -> dict[str, Any]:
    bank = await post(user_client, "/api/v1/companies", {"name": "Bank"})
    esn = await post(user_client, "/api/v1/companies", {"name": "ESN", "types": ["ESN"]})
    mission = await post(
        user_client,
        "/api/v1/missions",
        {
            "title": "Bank — Dev",
            "job_title": "Dev",
            "client_id": bank["id"],
            "employer_company_id": esn["id"],
            "start_date": "2026-01-05",
            "planned_end_date": "2026-06-30",
        },
    )
    m = mission["id"]
    # Subjects: SSO > Keycloak, and Kafka.
    sso = await post(
        user_client, "/api/v1/subjects", {"title": "SSO", "scope": "MISSION", "mission_id": m}
    )
    keycloak = await post(
        user_client,
        "/api/v1/subjects",
        {"title": "Keycloak", "scope": "MISSION", "mission_id": m, "parent_id": sso["id"]},
    )
    kafka = await post(
        user_client, "/api/v1/subjects", {"title": "Kafka", "scope": "MISSION", "mission_id": m}
    )
    # Half-days are filled by the tasks themselves (ADR-0034): 2 Mar AM+PM, 3 Mar AM, 5 Mar AM.
    done = [
        await task(user_client, keycloak["id"], "2026-03-02", "AM", 90, "Realm"),
        await task(user_client, sso["id"], "2026-03-02", "PM", 30, "Revue"),
        await task(user_client, kafka["id"], "2026-03-03", "AM", 60, "Topics"),
    ]
    for task_id in done:
        await user_client.patch(f"{TASKS}/{task_id}", json={"status": "DONE"})
    cancelled = await task(user_client, sso["id"], "2026-03-02", "PM", 20, "Annulée")
    await user_client.patch(f"{TASKS}/{cancelled}", json={"status": "CANCELLED"})
    await task(user_client, kafka["id"], "2026-03-05", "AM", 45, "Consumers")
    veille = await post(
        user_client, "/api/v1/subjects", {"title": "Veille", "scope": "INTERCONTRACT"}
    )
    await task(user_client, veille["id"], "2026-03-03", "PM", 60, "Lecture")  # not the mission

    # Architecture: API (Java, Kafka) linked to SSO; Bus (Kafka) linked to Kafka; Socle (Python).
    technologies = {}
    for name, category in [
        ("Java", "LANGUAGE"),
        ("Kafka", "MESSAGING"),
        ("Python", "LANGUAGE"),
        ("PostgreSQL", "DATABASE"),
    ]:
        technologies[name] = (
            await post(user_client, "/api/v1/technologies", {"name": name, "category": category})
        )["id"]
    project = await post(user_client, "/api/v1/projects", {"mission_id": m, "name": "Socle"})
    arch = await post(
        user_client,
        "/api/v1/architectures",
        {"company_id": bank["id"], "name": "SI", "project_id": project["id"]},
    )
    domains = {}
    for name, techs in [("API", ["Java", "Kafka"]), ("Bus", ["Kafka"]), ("Socle", ["Python"])]:
        domain = await post(
            user_client,
            "/api/v1/domains",
            {
                "company_id": bank["id"],
                "name": name,
                "kind": "SERVICE",
                "architecture_id": arch["id"],
            },
        )
        domains[name] = domain["id"]
        for tech in techs:
            await user_client.put(
                f"/api/v1/domains/{domain['id']}/technologies/{technologies[tech]}", json={}
            )
    await user_client.put(f"/api/v1/domains/{domains['API']}/subjects/{sso['id']}")
    await user_client.put(f"/api/v1/domains/{domains['Bus']}/subjects/{kafka['id']}")
    # Manual weights: Java 3, PostgreSQL 4.
    await user_client.put(
        f"/api/v1/missions/{m}/technologies/{technologies['Java']}", json={"weight": 3}
    )
    await user_client.put(
        f"/api/v1/missions/{m}/technologies/{technologies['PostgreSQL']}",
        json={"weight": 4, "version": "16"},
    )
    # Contacts: a manager, and someone without a role.
    role = await post(
        user_client, "/api/v1/contact-roles", {"name_fr": "Manager", "name_en": "Manager"}
    )
    for first, role_id in [("Ada", role["id"]), ("Bob", None)]:
        contact = await post(
            user_client, "/api/v1/contacts", {"first_name": first, "last_name": "X"}
        )
        await user_client.put(
            f"/api/v1/missions/{m}/contacts/{contact['id']}", json={"role_id": role_id}
        )
    # Documents: one attached, one linking to the mission.
    await post(
        user_client,
        "/api/v1/documents",
        {"title": "Onboarding", "attach_to": {"type": "mission", "id": m}},
    )
    await post(
        user_client,
        "/api/v1/documents",
        {"title": "Notes", "content_md": f"[[mission:{m}|la mission]]"},
    )
    return {"mission": m, "technologies": technologies, "arch": arch["id"], "api": domains["API"]}


async def test_time_spent_on_a_known_dataset(
    user_client: AsyncClient, data: dict[str, Any]
) -> None:
    overview = (await user_client.get(f"/api/v1/missions/{data['mission']}/overview")).json()
    time = overview["time"]
    # 2 Mar AM+PM, 3 Mar AM are past; 5 Mar AM is planned; the intercontract half-day is not
    # counted.
    assert (time["half_days_done"], time["half_days_planned"]) == (3, 1)
    assert (time["days_done"], time["days_planned"]) == (1.5, 0.5)
    # 5 Mar - 30 Jun 2026: 84 weekdays minus Easter Monday, 1 May, 8 May, Ascension, Whit Monday.
    assert time["days_remaining"] == 79.0
    # DONE minutes by top-level subject; Keycloak counts for SSO; cancelled and planned do not.
    assert time["by_subject"] == [
        {
            "subject": {"id": time["by_subject"][0]["subject"]["id"], "name": "SSO"},
            "minutes": 120,
            "task_count": 2,
        },
        {
            "subject": {"id": time["by_subject"][1]["subject"]["id"], "name": "Kafka"},
            "minutes": 60,
            "task_count": 1,
        },
    ]
    assert time["done_minutes"] == 180

    assert [t["title"] for t in overview["recent_tasks"]] == ["Topics", "Revue", "Annulée", "Realm"]
    assert [t["title"] for t in overview["planned_tasks"]] == ["Consumers"]
    # Tasks carry their subject's domains (ADR-0039).
    revue = next(t for t in overview["recent_tasks"] if t["title"] == "Revue")
    assert [d["name"] for d in revue["domains"]] == ["API"]


async def test_technology_weight_suggestion(user_client: AsyncClient, data: dict[str, Any]) -> None:
    overview = (await user_client.get(f"/api/v1/missions/{data['mission']}/overview")).json()
    rows = {r["technology"]["name"]: r for r in overview["technologies"]}
    # Kafka: SSO via API (30 min) + Kafka via Bus (60 min) = 90, the busiest -> 5.
    assert (
        rows["Kafka"]["minutes"],
        rows["Kafka"]["suggested_weight"],
        rows["Kafka"]["weight"],
    ) == (90, 5, None)
    # Java: 30 min -> 1 + round(4 x 30 / 90) = 2; manual weight kept beside it.
    assert (rows["Java"]["minutes"], rows["Java"]["suggested_weight"], rows["Java"]["weight"]) == (
        30,
        2,
        3,
    )
    # Python is in the architecture but nobody worked on it: 1.
    assert (rows["Python"]["minutes"], rows["Python"]["suggested_weight"]) == (0, 1)
    # PostgreSQL is only manual.
    assert (
        rows["PostgreSQL"]["weight"],
        rows["PostgreSQL"]["version"],
        rows["PostgreSQL"]["suggested_weight"],
    ) == (
        4,
        "16",
        None,
    )
    assert [r["technology"]["name"] for r in overview["technologies"]] == [
        "PostgreSQL",
        "Java",
        "Kafka",
        "Python",
    ]


async def test_contacts_architectures_documents(
    user_client: AsyncClient, data: dict[str, Any]
) -> None:
    overview = (await user_client.get(f"/api/v1/missions/{data['mission']}/overview")).json()
    groups = [
        (g["role"]["name_fr"] if g["role"] else None, [c["contact"]["name"] for c in g["contacts"]])
        for g in overview["contacts_by_role"]
    ]
    assert groups == [("Manager", ["Ada X"]), (None, ["Bob X"])]
    assert [a["name"] for a in overview["architectures"]] == ["SI"]
    assert [d["title"] for d in overview["documents"]] == ["Onboarding"]
    assert [b["document"]["title"] for b in overview["backlinks"]] == ["Notes"]
    assert overview["mission"]["title"] == "Bank — Dev"


async def test_days_remaining_edge_cases(
    user_client: AsyncClient, data: dict[str, Any], clock: FrozenClock
) -> None:
    url = f"/api/v1/missions/{data['mission']}/overview"
    clock.now = datetime(2026, 7, 15, tzinfo=UTC)  # after the end
    assert (await user_client.get(url)).json()["time"]["days_remaining"] == 0.0
    await user_client.patch(f"/api/v1/missions/{data['mission']}", json={"planned_end_date": None})
    assert (await user_client.get(url)).json()["time"]["days_remaining"] is None


async def test_career(user_client: AsyncClient, data: dict[str, Any]) -> None:
    career = (await user_client.get("/api/v1/career")).json()
    entry = career["missions"][0]
    assert entry["mission"]["title"] == "Bank — Dev"
    assert entry["days"] == 2.0  # 4 mission half-days
    assert [(t["technology"]["name"], t["weight"]) for t in entry["technologies"]] == [
        ("PostgreSQL", 4),
        ("Java", 3),
    ]


async def test_dashboard_is_private(
    user_client: AsyncClient, other_client: AsyncClient, data: dict[str, Any]
) -> None:
    assert (
        await other_client.get(f"/api/v1/missions/{data['mission']}/overview")
    ).status_code == 404
    assert (await other_client.get("/api/v1/career")).json() == {"missions": []}
