"""Auth, profile and account administration endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.errors import AppError, ErrorCode, error_body
from app.modules.auth.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.modules.auth.dependencies import AdminUser, AppSettings, CurrentUser, DbSession
from app.modules.auth.schemas import (
    LoginRequest,
    PasswordChange,
    PasswordReset,
    ProfileUpdate,
    UserCreate,
    UserList,
    UserRead,
    UserUpdate,
)
from app.modules.auth.service import AuthService, UserService

# Routes reachable without a session. Everything else is mounted behind authentication.
public_router = APIRouter(prefix="/auth", tags=["auth"])
auth_router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(prefix="/me", tags=["me"])
users_router = APIRouter(prefix="/users", tags=["users"])


def _user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@public_router.post("/login", response_model=UserRead)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: DbSession,
    settings: AppSettings,
) -> UserRead:
    result = await AuthService(session, settings).login(
        str(body.email), body.password, _user_agent(request)
    )
    set_auth_cookies(response, result.tokens, settings)
    return UserRead.model_validate(result.user)


@public_router.post(
    "/refresh",
    response_model=UserRead,
    responses={401: {"description": "Invalid refresh token"}, 409: {"description": "Rotated"}},
)
async def refresh(
    request: Request, response: Response, session: DbSession, settings: AppSettings
) -> UserRead | Response:
    try:
        result = await AuthService(session, settings).refresh(
            request.cookies.get(REFRESH_COOKIE), _user_agent(request)
        )
    except AppError as error:
        if error.code != ErrorCode.REFRESH_TOKEN_INVALID:
            raise
        # Same error body as the global handler, plus cleared cookies so the browser stops
        # presenting a dead refresh token.
        failure = JSONResponse(
            status_code=error.status_code, content=error_body(error.code, error.detail)
        )
        clear_auth_cookies(failure, settings)
        return failure
    set_auth_cookies(response, result.tokens, settings)
    return UserRead.model_validate(result.user)


@public_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, session: DbSession, settings: AppSettings) -> Response:
    await AuthService(session, settings).logout(request.cookies.get(REFRESH_COOKIE))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response, settings)
    return response


@auth_router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@me_router.patch("", response_model=UserRead)
async def update_me(
    body: ProfileUpdate, user: CurrentUser, session: DbSession, settings: AppSettings
) -> UserRead:
    updated = await AuthService(session, settings).update_profile(user, body)
    return UserRead.model_validate(updated)


@me_router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    request: Request,
    user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
) -> Response:
    tokens = await AuthService(session, settings).change_password(
        user, body.current_password, body.new_password, _user_agent(request)
    )
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    # Other sessions are revoked; this one continues with fresh tokens.
    set_auth_cookies(response, tokens, settings)
    return response


@users_router.get("", response_model=UserList)
async def list_users(
    _: AdminUser,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> UserList:
    users, total = await UserService(session).list(limit, offset)
    return UserList(items=[UserRead.model_validate(u) for u in users], total=total)


@users_router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, _: AdminUser, session: DbSession) -> UserRead:
    return UserRead.model_validate(await UserService(session).create(body))


@users_router.get("/{user_id}", response_model=UserRead)
async def read_user(user_id: uuid.UUID, _: AdminUser, session: DbSession) -> UserRead:
    return UserRead.model_validate(await UserService(session).get(user_id))


@users_router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID, body: UserUpdate, _: AdminUser, session: DbSession
) -> UserRead:
    return UserRead.model_validate(await UserService(session).update(user_id, body))


@users_router.post("/{user_id}/reset-password", response_model=UserRead)
async def reset_password(
    user_id: uuid.UUID, body: PasswordReset, _: AdminUser, session: DbSession
) -> UserRead:
    return UserRead.model_validate(
        await UserService(session).reset_password(user_id, body.new_password)
    )
