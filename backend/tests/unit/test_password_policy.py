"""ADR-0008 password policy."""

import pytest

from app.core.errors import ErrorCode
from app.modules.auth.password_policy import password_violations


@pytest.mark.parametrize(
    "password",
    [
        "Correct-Horse-42",
        "Abcdefghij1!",  # exactly 12
        "Abcdefghij1-",  # easy AZERTY symbol, no dead key needed
        "Ébène-Forêt-2026",  # accented letters count as letters
        "Abcdefghij1 ",  # a space is a symbol
    ],
)
def test_valid_passwords(password: str) -> None:
    assert password_violations(password) == []


@pytest.mark.parametrize(
    ("password", "expected"),
    [
        ("Abcdefgh1!", [ErrorCode.PASSWORD_TOO_SHORT]),
        ("abcdefghij1!", [ErrorCode.PASSWORD_MISSING_UPPERCASE]),
        ("ABCDEFGHIJ1!", [ErrorCode.PASSWORD_MISSING_LOWERCASE]),
        ("Abcdefghijk!", [ErrorCode.PASSWORD_MISSING_DIGIT]),
        ("Abcdefghijk1", [ErrorCode.PASSWORD_MISSING_SYMBOL]),
        ("A1!" + "a" * 126, [ErrorCode.PASSWORD_TOO_LONG]),
        (
            "",
            [
                ErrorCode.PASSWORD_TOO_SHORT,
                ErrorCode.PASSWORD_MISSING_UPPERCASE,
                ErrorCode.PASSWORD_MISSING_LOWERCASE,
                ErrorCode.PASSWORD_MISSING_DIGIT,
                ErrorCode.PASSWORD_MISSING_SYMBOL,
            ],
        ),
    ],
)
def test_violations_are_reported_in_order(password: str, expected: list[ErrorCode]) -> None:
    assert password_violations(password) == expected


def test_caret_is_accepted_but_never_required() -> None:
    assert password_violations("Abcdefghij1^") == []
    assert password_violations("Abcdefghij1!") == []
