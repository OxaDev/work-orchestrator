"""Cryptographic primitives: Argon2id hashing, JWT access tokens, opaque refresh tokens."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()  # Argon2id with the library's recommended parameters
# Verified against when the e-mail is unknown, so response time does not reveal accounts.
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-password")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - token type label, not a secret


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_verification_time(password: str) -> None:
    verify_password(_DUMMY_HASH, password)


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: uuid.UUID
    issued_at: datetime


def create_access_token(user_id: uuid.UUID, now: datetime, ttl: timedelta, secret: str) -> str:
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, secret: str, now: datetime) -> AccessTokenClaims | None:
    """Returns the claims, or None for any invalid, expired or foreign token."""
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            # Time checks use our clock (`now`), not PyJWT's wall clock.
            options={
                "require": ["sub", "exp", "iat", "type"],
                "verify_exp": False,
                "verify_iat": False,
            },
        )
        if payload["type"] != ACCESS_TOKEN_TYPE or payload["exp"] <= now.timestamp():
            return None
        return AccessTokenClaims(
            user_id=uuid.UUID(payload["sub"]),
            issued_at=datetime.fromtimestamp(payload["iat"], tz=now.tzinfo),
        )
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)  # 256 bits


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
