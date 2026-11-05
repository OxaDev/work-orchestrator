"""Authentication and account use cases (ADR-0007, ADR-0008, ADR-0009, ADR-0030)."""

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.modules.auth import security
from app.modules.auth.models import LoginThrottle, RefreshToken, User, UserRole
from app.modules.auth.password_policy import password_violations
from app.modules.auth.schemas import ProfileUpdate, UserCreate, UserUpdate
from app.shared.ids import uuid7

# Two tabs refreshing with the same token at once: the loser gets a soft error instead of
# triggering reuse detection, then retries with the cookie set by the winner (ADR-0030).
ROTATION_GRACE = timedelta(seconds=30)


async def revoke_user_sessions(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """Revokes every live refresh token of a user (password change/reset, deactivation)."""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def normalize_email(email: str) -> str:
    return email.strip().lower()


def ensure_password_policy(password: str) -> None:
    violations = password_violations(password)
    if violations:
        raise AppError(
            violations[0],
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            params={"violations": [code.value for code in violations]},
        )


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class Session:
    user: User
    tokens: IssuedTokens


def _invalid_credentials() -> AppError:
    return AppError(ErrorCode.INVALID_CREDENTIALS, status_code=status.HTTP_401_UNAUTHORIZED)


def _auth_required() -> AppError:
    return AppError(ErrorCode.AUTH_REQUIRED, status_code=status.HTTP_401_UNAUTHORIZED)


def _refresh_invalid() -> AppError:
    return AppError(ErrorCode.REFRESH_TOKEN_INVALID, status_code=status.HTTP_401_UNAUTHORIZED)


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    # --- tokens -------------------------------------------------------------------------

    async def _issue_tokens(
        self, user: User, now: datetime, family_id: uuid.UUID | None, user_agent: str | None
    ) -> IssuedTokens:
        raw_refresh = security.new_refresh_token()
        self.session.add(
            RefreshToken(
                user_id=user.id,
                family_id=family_id or uuid7(),
                token_hash=security.hash_refresh_token(raw_refresh),
                created_at=now,
                expires_at=now + timedelta(days=self.settings.refresh_token_ttl_days),
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        access = security.create_access_token(
            user.id,
            now,
            timedelta(minutes=self.settings.access_token_ttl_minutes),
            self.settings.secret_key.get_secret_value(),
        )
        return IssuedTokens(access_token=access, refresh_token=raw_refresh)

    async def _revoke_family(self, family_id: uuid.UUID, now: datetime) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    # --- login throttling -----------------------------------------------------------------

    async def _throttle(self, email: str, now: datetime) -> LoginThrottle:
        throttle = await self.session.get(LoginThrottle, email, with_for_update=True)
        if throttle is None:
            throttle = LoginThrottle(email=email, failed_count=0, updated_at=now)
            self.session.add(throttle)
        elif throttle.locked_until is not None and throttle.locked_until <= now:
            throttle.failed_count = 0
            throttle.locked_until = None
        return throttle

    async def _record_failure(self, throttle: LoginThrottle, now: datetime) -> None:
        throttle.failed_count += 1
        throttle.updated_at = now
        if throttle.failed_count >= self.settings.login_max_failures:
            throttle.locked_until = now + timedelta(minutes=self.settings.login_lockout_minutes)
        await self.session.commit()

    # --- use cases --------------------------------------------------------------------------

    async def login(self, email: str, password: str, user_agent: str | None) -> Session:
        now = utcnow()
        email = normalize_email(email)
        throttle = await self._throttle(email, now)
        if throttle.locked_until is not None:
            await self.session.commit()
            retry_after = math.ceil((throttle.locked_until - now).total_seconds())
            raise AppError(
                ErrorCode.TOO_MANY_LOGIN_ATTEMPTS,
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                params={"retryAfterSeconds": retry_after},
            )

        user = await self.session.scalar(select(User).where(User.email == email))
        if user is None:
            security.burn_verification_time(password)
            await self._record_failure(throttle, now)
            raise _invalid_credentials()
        if not security.verify_password(user.password_hash, password) or not user.is_active:
            await self._record_failure(throttle, now)
            raise _invalid_credentials()

        throttle.failed_count = 0
        throttle.locked_until = None
        throttle.updated_at = now
        if security.needs_rehash(user.password_hash):
            user.password_hash = security.hash_password(password)
        user.last_login_at = now
        tokens = await self._issue_tokens(user, now, family_id=None, user_agent=user_agent)
        await self.session.commit()
        return Session(user=user, tokens=tokens)

    async def refresh(self, raw_token: str | None, user_agent: str | None) -> Session:
        now = utcnow()
        if not raw_token:
            raise _refresh_invalid()
        token = await self.session.scalar(
            select(RefreshToken)
            .where(RefreshToken.token_hash == security.hash_refresh_token(raw_token))
            .with_for_update()
        )
        if token is None or token.revoked_at is not None or token.expires_at <= now:
            raise _refresh_invalid()
        if token.used_at is not None:
            if now - token.used_at <= ROTATION_GRACE:
                raise AppError(
                    ErrorCode.REFRESH_TOKEN_ALREADY_ROTATED, status_code=status.HTTP_409_CONFLICT
                )
            # Replay of an old rotated token: assume theft, kill the whole login (ADR-0007).
            await self._revoke_family(token.family_id, now)
            await self.session.commit()
            raise _refresh_invalid()

        user = await self.session.get(User, token.user_id)
        if user is None or not user.is_active:
            await self._revoke_family(token.family_id, now)
            await self.session.commit()
            raise _refresh_invalid()

        token.used_at = now
        tokens = await self._issue_tokens(user, now, token.family_id, user_agent)
        await self.session.commit()
        return Session(user=user, tokens=tokens)

    async def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        token = await self.session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == security.hash_refresh_token(raw_token)
            )
        )
        if token is not None:
            await self._revoke_family(token.family_id, utcnow())
            await self.session.commit()

    async def authenticate(self, access_token: str | None) -> User:
        now = utcnow()
        if not access_token:
            raise _auth_required()
        claims = security.decode_access_token(
            access_token, self.settings.secret_key.get_secret_value(), now
        )
        if claims is None:
            raise _auth_required()
        user = await self.session.get(User, claims.user_id)
        if user is None or not user.is_active:
            raise _auth_required()
        # JWT iat has second precision: compare at the same precision.
        if claims.issued_at < user.password_changed_at.replace(microsecond=0):
            raise _auth_required()
        return user

    async def change_password(
        self, user: User, current_password: str, new_password: str, user_agent: str | None
    ) -> IssuedTokens:
        if not security.verify_password(user.password_hash, current_password):
            raise AppError(
                ErrorCode.CURRENT_PASSWORD_INCORRECT, status_code=status.HTTP_400_BAD_REQUEST
            )
        ensure_password_policy(new_password)
        now = utcnow()
        user.password_hash = security.hash_password(new_password)
        user.password_changed_at = now
        await revoke_user_sessions(self.session, user.id, now)
        tokens = await self._issue_tokens(user, now, family_id=None, user_agent=user_agent)
        await self.session.commit()
        return tokens

    async def update_profile(self, user: User, changes: ProfileUpdate) -> User:
        for field, value in changes.model_dump(exclude_unset=True, exclude_none=True).items():
            if field not in {"employer_company_id", "holiday_subdivision"}:
                setattr(user, field, value)
        if "holiday_subdivision" in changes.model_fields_set:
            user.holiday_subdivision = changes.holiday_subdivision
        if "employer_company_id" in changes.model_fields_set:
            if changes.employer_company_id is not None:
                # Local import: directory depends on auth for its router dependencies.
                from app.modules.directory.service import CompanyService

                await CompanyService(self.session).get(changes.employer_company_id)
            user.employer_company_id = changes.employer_company_id
        await self.session.commit()
        return user


class UserService:
    """Account administration (ADR-0009)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, limit: int, offset: int) -> tuple[list[User], int]:
        total = await self.session.scalar(select(func.count()).select_from(User)) or 0
        users = await self.session.scalars(
            select(User).order_by(User.email).limit(limit).offset(offset)
        )
        return list(users), total

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self.session.get(User, user_id)
        if user is None:
            raise AppError(ErrorCode.USER_NOT_FOUND, status_code=status.HTTP_404_NOT_FOUND)
        return user

    async def get_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == normalize_email(email)))

    async def admin_exists(self) -> bool:
        count = await self.session.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN)
        )
        return bool(count)

    async def create(self, data: UserCreate) -> User:
        email = normalize_email(str(data.email))
        if await self.get_by_email(email) is not None:
            raise AppError(ErrorCode.EMAIL_ALREADY_USED, status_code=status.HTTP_409_CONFLICT)
        ensure_password_policy(data.password)
        user = User(
            email=email,
            display_name=data.display_name.strip(),
            password_hash=security.hash_password(data.password),
            role=data.role,
            password_changed_at=utcnow(),
        )
        self.session.add(user)
        await self.session.commit()
        return user

    async def _active_admin_count(self) -> int:
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            )
            or 0
        )

    async def update(self, user_id: uuid.UUID, changes: UserUpdate) -> User:
        user = await self.get(user_id)
        values = changes.model_dump(exclude_unset=True, exclude_none=True)
        loses_admin = user.role == UserRole.ADMIN and user.is_active
        loses_admin = loses_admin and (
            values.get("role", UserRole.ADMIN) != UserRole.ADMIN
            or values.get("is_active", True) is False
        )
        if loses_admin and await self._active_admin_count() <= 1:
            raise AppError(ErrorCode.LAST_ADMIN, status_code=status.HTTP_409_CONFLICT)
        for field, value in values.items():
            setattr(user, field, value)
        if values.get("is_active") is False:
            await revoke_user_sessions(self.session, user.id, utcnow())
        await self.session.commit()
        return user

    async def reset_password(self, user_id: uuid.UUID, new_password: str) -> User:
        user = await self.get(user_id)
        ensure_password_policy(new_password)
        now = utcnow()
        user.password_hash = security.hash_password(new_password)
        user.password_changed_at = now
        await revoke_user_sessions(self.session, user.id, now)
        await self.session.commit()
        return user
