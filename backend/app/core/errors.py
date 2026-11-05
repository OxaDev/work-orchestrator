"""Unified error model (ADR-0014).

Every error response has the shape ``{"code": ..., "detail": ..., "params": {...}}``.
``code`` is a stable UPPER_SNAKE_CASE identifier translated by the frontend (ADR-0013);
``detail`` is English text meant for logs and developers only.
"""

import logging
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ErrorCode(StrEnum):
    """Registry of every error code the API may return."""

    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    HTTP_ERROR = "HTTP_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"

    # Authentication and accounts (ADR-0007, ADR-0008, ADR-0009, ADR-0030)
    AUTH_REQUIRED = "AUTH_REQUIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOO_MANY_LOGIN_ATTEMPTS = "TOO_MANY_LOGIN_ATTEMPTS"
    REFRESH_TOKEN_INVALID = "REFRESH_TOKEN_INVALID"
    REFRESH_TOKEN_ALREADY_ROTATED = "REFRESH_TOKEN_ALREADY_ROTATED"
    FORBIDDEN = "FORBIDDEN"
    USER_NOT_FOUND = "USER_NOT_FOUND"
    EMAIL_ALREADY_USED = "EMAIL_ALREADY_USED"
    LAST_ADMIN = "LAST_ADMIN"
    CURRENT_PASSWORD_INCORRECT = "CURRENT_PASSWORD_INCORRECT"
    PASSWORD_TOO_SHORT = "PASSWORD_TOO_SHORT"
    PASSWORD_TOO_LONG = "PASSWORD_TOO_LONG"
    PASSWORD_MISSING_UPPERCASE = "PASSWORD_MISSING_UPPERCASE"
    PASSWORD_MISSING_LOWERCASE = "PASSWORD_MISSING_LOWERCASE"
    PASSWORD_MISSING_DIGIT = "PASSWORD_MISSING_DIGIT"
    PASSWORD_MISSING_SYMBOL = "PASSWORD_MISSING_SYMBOL"

    # Shared referentials (ADR-0022, ADR-0031). `params.entity` names the entity concerned.
    NAME_ALREADY_USED = "NAME_ALREADY_USED"
    ENTITY_REFERENCED = "ENTITY_REFERENCED"
    TREE_CYCLE_DETECTED = "TREE_CYCLE_DETECTED"
    ORG_UNIT_COMPANY_MISMATCH = "ORG_UNIT_COMPANY_MISMATCH"
    INVALID_DATE_RANGE = "INVALID_DATE_RANGE"

    # Missions (ADR-0017, ADR-0032)
    MISSION_EMPLOYER_REQUIRED = "MISSION_EMPLOYER_REQUIRED"
    MISSION_HAS_HALF_DAYS_OUTSIDE = "MISSION_HAS_HALF_DAYS_OUTSIDE"

    # Agenda (ADR-0018, ADR-0019, ADR-0021, ADR-0033)
    HALF_DAY_MISSION_REQUIRED = "HALF_DAY_MISSION_REQUIRED"
    HALF_DAY_MISSION_NOT_ALLOWED = "HALF_DAY_MISSION_NOT_ALLOWED"
    MISSION_DATE_OUT_OF_RANGE = "MISSION_DATE_OUT_OF_RANGE"
    SUBTYPE_KIND_MISMATCH = "SUBTYPE_KIND_MISMATCH"
    LOCATION_NOT_ALLOWED = "LOCATION_NOT_ALLOWED"
    RANGE_TOO_LARGE = "RANGE_TOO_LARGE"
    MONTH_LOCKED = "MONTH_LOCKED"
    MONTH_INCOMPLETE = "MONTH_INCOMPLETE"
    MONTH_NOT_LOCKED = "MONTH_NOT_LOCKED"


class AppError(Exception):
    """Base class for errors raised by services; mapped to a JSON error response."""

    def __init__(
        self,
        code: ErrorCode,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        detail: str | None = None,
        params: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.status_code = status_code
        self.detail = detail or code.value
        self.params = params or {}
        super().__init__(self.detail)


def error_body(
    code: ErrorCode, detail: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    return {"code": code.value, "detail": detail, "params": params or {}}


_HTTP_STATUS_CODES = {
    status.HTTP_404_NOT_FOUND: ErrorCode.NOT_FOUND,
    status.HTTP_405_METHOD_NOT_ALLOWED: ErrorCode.METHOD_NOT_ALLOWED,
}


async def _app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)  # noqa: S101 - narrowing for the type checker
    return JSONResponse(
        content=error_body(exc.code, exc.detail, exc.params), status_code=exc.status_code
    )


async def _http_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    code = _HTTP_STATUS_CODES.get(exc.status_code, ErrorCode.HTTP_ERROR)
    return JSONResponse(
        content=error_body(code, str(exc.detail)),
        status_code=exc.status_code,
        headers=getattr(exc, "headers", None),
    )


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    fields = [
        {
            "location": [str(part) for part in error["loc"]],
            "type": error["type"],
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=error_body(
            ErrorCode.VALIDATION_ERROR, "Request validation failed", {"fields": fields}
        ),
    )


async def _unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_body(ErrorCode.INTERNAL_ERROR, "Internal server error"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
