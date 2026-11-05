"""CLI account commands against the test database (ADR-0009, P1-10).

These commands open their own sessions and commit, so each test cleans up its users.
"""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete

from app.cli import PASSWORD_ENV, main
from app.core.config import Settings
from app.core.db import dispose_engine, get_sessionmaker
from app.modules.auth.models import User
from app.modules.auth.security import verify_password
from app.modules.auth.service import UserService

EMAIL = "cli-admin@example.com"
PASSWORD = "Cli-Admin-Pass-1"  # noqa: S105


@pytest.fixture
async def clean_users(migrated_database: Settings) -> AsyncIterator[None]:
    async def _purge() -> None:
        async with get_sessionmaker()() as session:
            await session.execute(delete(User))
            await session.commit()
        await dispose_engine()

    await _purge()
    yield
    await _purge()


async def _get(email: str) -> User | None:
    async with get_sessionmaker()() as session:
        user = await UserService(session).get_by_email(email)
    await dispose_engine()
    return user


@pytest.fixture
def password_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(PASSWORD_ENV, PASSWORD)


def _run(*argv: str) -> None:
    # The CLI runs its own event loop: execute it in a worker thread.
    import threading

    errors: list[BaseException] = []

    def target() -> None:
        try:
            main(list(argv))
        except BaseException as error:
            errors.append(error)

    thread = threading.Thread(target=target)
    thread.start()
    thread.join()
    if errors:
        raise errors[0]


@pytest.mark.usefixtures("clean_users", "password_env")
async def test_create_admin_then_skip_if_exists(capsys: pytest.CaptureFixture[str]) -> None:
    _run("create-admin", "--email", EMAIL, "--display-name", "CLI Admin")
    user = await _get(EMAIL)
    assert user is not None
    assert user.role == "ADMIN"
    _run("create-admin", "--skip-if-exists")
    assert "already exists" in capsys.readouterr().out


@pytest.mark.usefixtures("clean_users", "password_env")
async def test_create_admin_reports_policy_violations(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv(PASSWORD_ENV, "weak")
    with pytest.raises(SystemExit) as exit_info:
        _run("create-admin", "--email", EMAIL, "--display-name", "CLI Admin")
    assert exit_info.value.code == 1
    assert "PASSWORD_TOO_SHORT" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_users")
async def test_create_admin_without_terminal_or_password_explains_what_to_do(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv(PASSWORD_ENV, raising=False)
    _run("create-admin", "--skip-if-exists")
    assert "make create-admin" in capsys.readouterr().out
    with pytest.raises(SystemExit):
        _run("create-admin", "--email", EMAIL, "--display-name", "X")
    assert "WO_PASSWORD" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_users", "password_env")
async def test_create_admin_needs_email_without_terminal(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit):
        _run("create-admin", "--display-name", "X")
    assert "E-mail" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_users", "password_env")
async def test_reset_password(monkeypatch: pytest.MonkeyPatch) -> None:
    _run("create-admin", "--email", EMAIL, "--display-name", "CLI Admin")
    monkeypatch.setenv(PASSWORD_ENV, "Brand-New-Pass-2")
    _run("reset-password", "--email", EMAIL)
    user = await _get(EMAIL)
    assert user is not None
    assert verify_password(user.password_hash, "Brand-New-Pass-2")

    monkeypatch.setenv(PASSWORD_ENV, "weak")
    with pytest.raises(SystemExit):
        _run("reset-password", "--email", EMAIL)


@pytest.mark.usefixtures("clean_users", "password_env")
async def test_reset_password_unknown_user(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        _run("reset-password", "--email", "nobody@example.com")
    assert "No user" in capsys.readouterr().err
