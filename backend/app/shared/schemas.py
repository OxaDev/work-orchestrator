"""Schemas and helpers shared by every module."""

from typing import Annotated

from fastapi import Query, status
from pydantic import BaseModel

from app.core.errors import AppError, ErrorCode

# List endpoints (ADR-0014).
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]
Search = Annotated[str | None, Query(max_length=200)]
IncludeArchived = Annotated[bool, Query()]


class Page[T](BaseModel):
    items: list[T]
    total: int


def not_found(entity: str) -> AppError:
    return AppError(
        ErrorCode.NOT_FOUND, status_code=status.HTTP_404_NOT_FOUND, params={"entity": entity}
    )


def name_already_used(entity: str) -> AppError:
    return AppError(
        ErrorCode.NAME_ALREADY_USED, status_code=status.HTTP_409_CONFLICT, params={"entity": entity}
    )


def entity_referenced(entity: str, by: str) -> AppError:
    return AppError(
        ErrorCode.ENTITY_REFERENCED,
        status_code=status.HTTP_409_CONFLICT,
        params={"entity": entity, "referencedBy": by},
    )
