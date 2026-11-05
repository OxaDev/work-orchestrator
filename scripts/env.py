#!/usr/bin/env python3
"""Create or complete `.env` from `.env.example` (used by `make env`).

- `.env` missing: copy the template, replacing every `__GENERATE__` with a random secret.
- `.env` present: never touch existing values; append keys that are new in the template.
"""

import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / ".env.example"
TARGET = ROOT / ".env"
PLACEHOLDER = "__GENERATE__"
KEY_RE = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def _fill(line: str) -> str:
    return line.replace(PLACEHOLDER, secrets.token_urlsafe(32))


def _keys(lines: list[str]) -> set[str]:
    return {m.group(1) for line in lines if (m := KEY_RE.match(line))}


def main() -> int:
    template_lines = TEMPLATE.read_text().splitlines()
    if not TARGET.exists():
        TARGET.write_text("\n".join(_fill(line) for line in template_lines) + "\n")
        TARGET.chmod(0o600)
        print(f"Created {TARGET.name} with generated secrets.")
        return 0

    existing = TARGET.read_text().splitlines()
    missing = [
        _fill(line)
        for line in template_lines
        if (m := KEY_RE.match(line)) and m.group(1) not in _keys(existing)
    ]
    if missing:
        with TARGET.open("a") as handle:
            handle.write("\n# Added by `make env`\n" + "\n".join(missing) + "\n")
        print(f"Appended {len(missing)} new key(s) to {TARGET.name}.")
    else:
        print(f"{TARGET.name} is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
