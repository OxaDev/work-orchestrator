import uuid
from typing import cast

from sqlalchemy import Table
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.schema import CallableColumnDefault

from app.shared.models import ArchivableMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin


class _Sample(UUIDPrimaryKeyMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "_sample_for_tests"
    name: Mapped[str] = mapped_column()


TABLE = cast(Table, _Sample.__table__)


def test_mixins_add_expected_columns() -> None:
    columns = set(TABLE.columns.keys())
    assert {"id", "created_at", "updated_at", "archived_at", "name"} <= columns


def test_primary_key_defaults_to_uuid7() -> None:
    default = TABLE.c.id.default
    assert isinstance(default, CallableColumnDefault)
    value = default.arg(None)  # type: ignore[arg-type]  # context unused by uuid7
    assert isinstance(value, uuid.UUID)
    assert value.version == 7


def test_naming_convention_is_applied() -> None:
    assert TABLE.primary_key.name == "pk__sample_for_tests"


def teardown_module() -> None:
    # Keep the shared metadata clean for Alembic and other tests.
    Base.metadata.remove(TABLE)
