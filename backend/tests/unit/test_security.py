import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.modules.auth import security

SECRET = "test-secret-with-enough-length-for-hs256"  # noqa: S105
NOW = datetime(2026, 11, 5, 12, 0, 0, tzinfo=UTC)


def test_hash_and_verify_password() -> None:
    hashed = security.hash_password("Correct-Horse-42")
    assert hashed.startswith("$argon2id$")
    assert security.verify_password(hashed, "Correct-Horse-42")
    assert not security.verify_password(hashed, "wrong")
    assert not security.needs_rehash(hashed)


def test_verify_rejects_malformed_hash() -> None:
    assert not security.verify_password("not-a-hash", "x")


def test_burn_verification_time_never_raises() -> None:
    security.burn_verification_time("anything")


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()
    token = security.create_access_token(user_id, NOW, timedelta(minutes=15), SECRET)
    claims = security.decode_access_token(token, SECRET, NOW + timedelta(minutes=14))
    assert claims is not None
    assert claims.user_id == user_id
    assert claims.issued_at == NOW


def test_access_token_expires() -> None:
    token = security.create_access_token(uuid.uuid4(), NOW, timedelta(minutes=15), SECRET)
    assert security.decode_access_token(token, SECRET, NOW + timedelta(minutes=15)) is None


def test_access_token_with_wrong_secret_or_garbage_is_rejected() -> None:
    token = security.create_access_token(uuid.uuid4(), NOW, timedelta(minutes=15), SECRET)
    assert security.decode_access_token(token, "another-secret-of-sufficient-len", NOW) is None
    assert security.decode_access_token("garbage", SECRET, NOW) is None


def test_token_of_another_type_is_rejected() -> None:
    payload = {"sub": str(uuid.uuid4()), "type": "refresh", "iat": 0, "exp": 2**40}
    token = jwt.encode(payload, SECRET, algorithm="HS256")
    assert security.decode_access_token(token, SECRET, NOW) is None


def test_refresh_tokens_are_random_and_hashed_deterministically() -> None:
    first, second = security.new_refresh_token(), security.new_refresh_token()
    assert first != second
    assert security.hash_refresh_token(first) == security.hash_refresh_token(first)
    assert len(security.hash_refresh_token(first)) == 64


def test_validity_is_judged_against_the_given_clock_not_the_wall_clock() -> None:
    future = datetime(2099, 1, 1, tzinfo=UTC)
    token = security.create_access_token(uuid.uuid4(), future, timedelta(minutes=15), SECRET)
    assert security.decode_access_token(token, SECRET, future) is not None
