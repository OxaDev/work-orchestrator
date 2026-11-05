"""Password policy (ADR-0008). Mirrored in frontend/src/features/auth/passwordPolicy.ts."""

from app.core.errors import ErrorCode

MIN_LENGTH = 12
MAX_LENGTH = 128


def password_violations(password: str) -> list[ErrorCode]:
    """Returns every rule the password breaks, in a stable order (empty list = valid).

    A symbol is any printable non-alphanumeric character: no specific (dead-key) symbol
    such as ``^`` is ever required.
    """
    violations: list[ErrorCode] = []
    if len(password) < MIN_LENGTH:
        violations.append(ErrorCode.PASSWORD_TOO_SHORT)
    if len(password) > MAX_LENGTH:
        violations.append(ErrorCode.PASSWORD_TOO_LONG)
    if not any(char.isupper() for char in password):
        violations.append(ErrorCode.PASSWORD_MISSING_UPPERCASE)
    if not any(char.islower() for char in password):
        violations.append(ErrorCode.PASSWORD_MISSING_LOWERCASE)
    if not any(char.isdigit() for char in password):
        violations.append(ErrorCode.PASSWORD_MISSING_DIGIT)
    if not any(not char.isalnum() and char.isprintable() for char in password):
        violations.append(ErrorCode.PASSWORD_MISSING_SYMBOL)
    return violations
