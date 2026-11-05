"""FastAPI dependencies for authentication and authorisation."""

from typing import Annotated

from fastapi import Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.db import get_session
from app.core.errors import AppError, ErrorCode
from app.modules.auth.cookies import ACCESS_COOKIE
from app.modules.auth.models import User, UserRole
from app.modules.auth.service import AuthService


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


AppSettings = Annotated[Settings, Depends(get_app_settings)]
DbSession = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(request: Request, session: DbSession, settings: AppSettings) -> User:
    return await AuthService(session, settings).authenticate(request.cookies.get(ACCESS_COOKIE))


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN:
        raise AppError(ErrorCode.FORBIDDEN, status_code=status.HTTP_403_FORBIDDEN)
    return user


AdminUser = Annotated[User, Depends(require_admin)]
