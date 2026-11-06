"""Mission dashboard and career endpoints (P10, ADR-0039). Personal data (ADR-0010)."""

import uuid

from fastapi import APIRouter

from app.modules.auth.dependencies import CurrentUser, DbSession
from app.modules.dashboard.schemas import Career, MissionOverview
from app.modules.dashboard.service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/missions/{mission_id}/overview", response_model=MissionOverview)
async def mission_overview(
    mission_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> MissionOverview:
    """Time spent, tasks, weighted technologies with suggestions, contacts, architectures,
    documents of a mission, in one request."""
    return await DashboardService(session, user).overview(mission_id)


@router.get("/career", response_model=Career)
async def career(user: CurrentUser, session: DbSession) -> Career:
    """Every mission on a timeline, with its days and main technologies (P10-5)."""
    return await DashboardService(session, user).career()
