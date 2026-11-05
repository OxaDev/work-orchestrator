"""FastAPI application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.core.config import Settings, get_settings
from app.core.db import dispose_engine
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.modules.agenda.router import router as agenda_router
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.router import auth_router, me_router, public_router, users_router
from app.modules.directory.router import (
    companies_router,
    contacts_router,
    org_units_router,
    sectors_router,
)
from app.modules.missions.router import roles_router
from app.modules.missions.router import router as missions_router
from app.modules.system.router import router as system_router
from app.modules.tags.router import router as tags_router
from app.modules.technologies.router import router as technologies_router

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    yield
    await dispose_engine()


# Every route is authenticated unless explicitly listed here (ADR-0030).
PUBLIC_ROUTERS = (system_router, public_router)


def build_api_router() -> APIRouter:
    api = APIRouter(prefix=API_PREFIX)
    for router in PUBLIC_ROUTERS:
        api.include_router(router)

    protected = APIRouter(dependencies=[Depends(get_current_user)])
    protected.include_router(auth_router)
    protected.include_router(me_router)
    protected.include_router(users_router)
    for router in (
        sectors_router,
        companies_router,
        org_units_router,
        contacts_router,
        technologies_router,
        tags_router,
        missions_router,
        roles_router,
        agenda_router,
    ):
        protected.include_router(router)
    api.include_router(protected)
    return api


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Work Orchestrator API",
        version=__version__,
        # The public prefix (ADR-0011) is given to the server (`uvicorn --root-path`), not here:
        # routes start at /api because the frontend nginx strips BASE_PATH before proxying.
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    register_exception_handlers(app)

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(build_api_router())
    return app


app = create_app()
