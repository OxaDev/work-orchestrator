"""Authentication models: users, refresh tokens, login throttling (ADR-0007, ADR-0030)."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import Base, TimestampMixin, UUIDPrimaryKeyMixin, string_enum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    USER = "USER"


class Locale(StrEnum):
    FR = "fr"
    EN = "en"


class ThemePreference(StrEnum):
    AUTO = "auto"
    LIGHT = "light"
    DARK = "dark"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Always stored lower-cased (normalised by the service).
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(
        string_enum(UserRole, "user_role"), default=UserRole.USER
    )
    locale: Mapped[Locale] = mapped_column(string_enum(Locale, "user_locale"), default=Locale.FR)
    theme: Mapped[ThemePreference] = mapped_column(
        string_enum(ThemePreference, "user_theme"), default=ThemePreference.AUTO
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    # Access tokens issued before this instant are rejected (password change, reset).
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "My ESN" (ADR-0017): copied onto each new mission.
    employer_company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL")
    )
    # French public holidays region (ADR-0018): None = metropolitan France, "57" = Alsace-Moselle,
    # overseas departments by INSEE code ("971"...). Codes from the `holidays` library.
    holiday_subdivision: Mapped[str | None] = mapped_column(String(8))


class RefreshToken(UUIDPrimaryKeyMixin, Base):
    """Opaque refresh token, stored hashed. Tokens of one login share a `family_id`."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Set when rotated (used) or revoked; presenting such a token again means theft.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))


class LoginThrottle(Base):
    """Failed login counter keyed by e-mail, whether or not the account exists (ADR-0030)."""

    __tablename__ = "login_throttles"

    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
