"""Command-line utilities: ``uv run python -m app.cli <command>`` (ADR-0009).

    openapi                         print the OpenAPI schema (make api-client)
    create-admin [--email E] [--display-name N] [--skip-if-exists]
    reset-password --email E
    seed-reference                  idempotent reference data (sectors, technologies)
    seed-demo                       fictional demonstration data (development only)

Passwords are read interactively, or from ``WO_PASSWORD`` for non-interactive use (tests, e2e).
"""

import argparse
import asyncio
import getpass
import json
import os
import sys
from collections.abc import Awaitable, Callable

from app.core.config import get_settings
from app.core.db import dispose_engine, get_sessionmaker
from app.core.errors import AppError
from app.modules.auth.models import UserRole
from app.modules.auth.schemas import UserCreate
from app.modules.auth.service import UserService

PASSWORD_ENV = "WO_PASSWORD"  # noqa: S105 - name of an environment variable


class CliError(Exception):
    """Expected failure: message printed, exit code 1."""


def export_openapi(_: argparse.Namespace) -> None:
    from app.main import create_app  # local import: avoids configuring logging for other commands

    schema = create_app().openapi()
    json.dump(schema, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


def _ask(prompt: str, given: str | None) -> str:
    if given:
        return given
    if not sys.stdin.isatty():
        raise CliError(f"Missing value for '{prompt}' and no terminal to ask it.")
    return input(f"{prompt}: ").strip()


def _ask_password() -> str:
    from_env = os.environ.get(PASSWORD_ENV)
    if from_env:
        return from_env
    if not sys.stdin.isatty():
        raise CliError(f"No terminal: set {PASSWORD_ENV} to provide the password.")
    first = getpass.getpass("Password (12+ chars, upper, lower, digit, symbol): ")
    if getpass.getpass("Repeat password: ") != first:
        raise CliError("Passwords do not match.")
    return first


def _describe(error: AppError) -> str:
    violations = error.params.get("violations")
    return f"{error.code.value}: {', '.join(violations)}" if violations else error.code.value


async def _create_admin(args: argparse.Namespace) -> None:
    async with get_sessionmaker()() as session:
        users = UserService(session)
        if args.skip_if_exists and await users.admin_exists():
            print("An administrator already exists; nothing to do.")
            return
        if args.skip_if_exists and not sys.stdin.isatty() and PASSWORD_ENV not in os.environ:
            print("No administrator yet. Create one with: make create-admin")
            return
        email = _ask("E-mail", args.email)
        display_name = _ask("Display name", args.display_name)
        try:
            user = await users.create(
                UserCreate(
                    email=email,
                    display_name=display_name,
                    password=_ask_password(),
                    role=UserRole.ADMIN,
                )
            )
        except AppError as error:
            raise CliError(_describe(error)) from error
        print(f"Administrator {user.email} created.")


async def _reset_password(args: argparse.Namespace) -> None:
    async with get_sessionmaker()() as session:
        users = UserService(session)
        user = await users.get_by_email(args.email)
        if user is None:
            raise CliError(f"No user with e-mail {args.email}.")
        try:
            await users.reset_password(user.id, _ask_password())
        except AppError as error:
            raise CliError(_describe(error)) from error
        print(f"Password of {user.email} reset; all its sessions were revoked.")


async def _seed_reference(_: argparse.Namespace) -> None:
    from app.seed.reference import seed_reference

    async with get_sessionmaker()() as session:
        report = await seed_reference(session)
    print(
        f"Reference data: {report.sectors_added} sector(s), "
        f"{report.technologies_added} technology(ies), {report.roles_added} contact role(s), "
        f"{report.subtypes_added} half-day subtype(s) added."
    )


async def _seed_demo(_: argparse.Namespace) -> None:
    from app.seed.demo import seed_demo
    from app.seed.reference import seed_reference

    if get_settings().environment == "production":
        raise CliError("Demo data is never loaded in production.")
    from sqlalchemy import select

    from app.modules.auth.models import User
    from app.seed.demo import seed_demo_missions

    async with get_sessionmaker()() as session:
        await seed_reference(session)
        created = await seed_demo(session)
        print("Demo data loaded." if created else "Demo data already present; nothing to do.")
        owner = await session.scalar(
            select(User).where(User.role == UserRole.ADMIN).order_by(User.created_at).limit(1)
        )
        if owner is None:
            print("No administrator yet: demo missions skipped (run make create-admin-dev).")
            return
        missions = await seed_demo_missions(session, owner)
        print(
            f"Demo missions loaded for {owner.email}."
            if missions
            else "Demo missions already present; nothing to do."
        )


def _run_async(
    command: Callable[[argparse.Namespace], Awaitable[None]],
) -> Callable[[argparse.Namespace], None]:
    def runner(args: argparse.Namespace) -> None:
        async def main() -> None:
            try:
                await command(args)
            finally:
                await dispose_engine()

        get_settings()  # fail fast on invalid configuration
        asyncio.run(main())

    return runner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("openapi", help="print the OpenAPI schema").set_defaults(func=export_openapi)

    admin = sub.add_parser("create-admin", help="create an administrator account")
    admin.add_argument("--email")
    admin.add_argument("--display-name")
    admin.add_argument(
        "--skip-if-exists", action="store_true", help="do nothing if an admin already exists"
    )
    admin.set_defaults(func=_run_async(_create_admin))

    reset = sub.add_parser("reset-password", help="reset a user's password")
    reset.add_argument("--email", required=True)
    reset.set_defaults(func=_run_async(_reset_password))

    sub.add_parser("seed-reference", help="load reference data").set_defaults(
        func=_run_async(_seed_reference)
    )
    sub.add_parser("seed-demo", help="load fictional demo data").set_defaults(
        func=_run_async(_seed_demo)
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except CliError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
