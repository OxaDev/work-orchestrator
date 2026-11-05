import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Mantine palette names, rendered as badge colours by the frontend.
TagColor = Literal[
    "gray", "red", "pink", "grape", "violet", "indigo", "blue", "cyan",
    "teal", "green", "lime", "yellow", "orange",
]  # fmt: skip


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str


class TagWithUsage(TagRead):
    usage: int


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: TagColor = "gray"


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: TagColor | None = None
