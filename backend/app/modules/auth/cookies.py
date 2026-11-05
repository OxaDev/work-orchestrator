"""Auth cookies (ADR-0007, ADR-0011, ADR-0030): httpOnly, SameSite=Strict, scoped paths."""

from fastapi import Response

from app.core.config import Settings
from app.modules.auth.service import IssuedTokens

ACCESS_COOKIE = "wo_access"
REFRESH_COOKIE = "wo_refresh"


def set_auth_cookies(response: Response, tokens: IssuedTokens, settings: Settings) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        tokens.access_token,
        max_age=settings.access_token_ttl_minutes * 60,
        path=settings.cookie_path,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    for name, path in (
        (ACCESS_COOKIE, settings.cookie_path),
        (REFRESH_COOKIE, settings.refresh_cookie_path),
    ):
        response.delete_cookie(
            name, path=path, httponly=True, secure=settings.secure_cookies, samesite="strict"
        )
