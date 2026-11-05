#!/usr/bin/env python3
"""ADR tooling (ADR-0001): `new` creates a numbered ADR, `check` validates the folder.

Usage:
    python3 scripts/adr.py new "Use server-sent events for live refresh"
    python3 scripts/adr.py check
"""

import argparse
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ADR_DIR = Path(__file__).resolve().parents[1] / "docs" / "adr"
INDEX = ADR_DIR / "README.md"
TEMPLATE = ADR_DIR / "0000-template.md"
FILE_RE = re.compile(r"^(\d{4})-[a-z0-9-]+\.md$")
NEXT_RE = re.compile(r"Next free number: \*\*(\d{4})\*\*")
ROW_RE = re.compile(r"^\| \[(\d{4})\]\((\d{4}-[a-z0-9-]+\.md)\) \|")
STATUS_RE = re.compile(r"^- \*\*Status\*\*: (.+)$", re.MULTILINE)
VALID_STATUS = re.compile(r"^(Proposed|Accepted|Rejected|Deprecated|Superseded by .+)$")
# Template placeholders look like <...>; inline code spans are ignored (paths like `<id>`).
PLACEHOLDER_RE = re.compile(r"<[^>\n]+>")
CODE_SPAN_RE = re.compile(r"`[^`\n]*`")
FENCE_RE = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)


def slugify(title: str) -> str:
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")


def adr_files() -> dict[str, Path]:
    return {
        m.group(1): path
        for path in sorted(ADR_DIR.glob("*.md"))
        if (m := FILE_RE.match(path.name)) and m.group(1) != "0000"
    }


def next_number(index_text: str) -> str:
    match = NEXT_RE.search(index_text)
    if not match:
        raise SystemExit("README.md has no 'Next free number' line.")
    return match.group(1)


def cmd_new(title: str) -> int:
    index_text = INDEX.read_text()
    number = next_number(index_text)
    filename = f"{number}-{slugify(title)}.md"
    target = ADR_DIR / filename
    today = date.today().isoformat()

    body = TEMPLATE.read_text()
    body = body.replace("ADR-NNNN: <Short title, imperative or noun phrase>", f"ADR-{number}: {title}")
    body = body.replace("YYYY-MM-DD", today, 1)
    target.write_text(body)

    row = f"| [{number}]({filename}) | {title} | Proposed | {today} | <tags> |"
    lines = index_text.splitlines()
    last_row = max(i for i, line in enumerate(lines) if ROW_RE.match(line))
    lines.insert(last_row + 1, row)
    updated = "\n".join(lines) + "\n"
    updated = NEXT_RE.sub(f"Next free number: **{int(number) + 1:04d}**", updated)
    INDEX.write_text(updated)

    print(f"Created docs/adr/{filename} (status Proposed). Fill every section, set tags in README.")
    return 0


def _strip_code(text: str) -> str:
    return CODE_SPAN_RE.sub("", FENCE_RE.sub("", text))


def cmd_check() -> int:
    errors: list[str] = []
    files = adr_files()
    index_text = INDEX.read_text()
    rows = {m.group(1): m.group(2) for line in index_text.splitlines() if (m := ROW_RE.match(line))}

    for number, path in files.items():
        if number not in rows:
            errors.append(f"{path.name}: missing from README index")
        elif rows[number] != path.name:
            errors.append(f"{path.name}: index links to {rows[number]}")
        text = path.read_text()
        if not text.startswith(f"# ADR-{number}: "):
            errors.append(f"{path.name}: title must start with '# ADR-{number}: '")
        status = STATUS_RE.search(text)
        if not status or not VALID_STATUS.match(status.group(1).strip()):
            errors.append(f"{path.name}: invalid or missing Status line")
        leftovers = PLACEHOLDER_RE.findall(_strip_code(text))
        if leftovers:
            errors.append(f"{path.name}: unfilled placeholders {leftovers[:3]}")

    for number in rows:
        if number not in files:
            errors.append(f"README index row {number}: file does not exist")
    if "<tags>" in index_text:
        errors.append("README index: replace <tags> with real tags")

    expected_next = f"{(max(map(int, files)) + 1) if files else 1:04d}"
    if next_number(index_text) != expected_next:
        errors.append(f"README: 'Next free number' should be {expected_next}")

    for error in errors:
        print(f"ADR check: {error}", file=sys.stderr)
    if not errors:
        print(f"ADR check: {len(files)} ADRs OK.")
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="adr")
    sub = parser.add_subparsers(dest="command", required=True)
    new = sub.add_parser("new", help="create a new ADR from the template")
    new.add_argument("title")
    sub.add_parser("check", help="validate ADR files and index")
    args = parser.parse_args(argv)
    return cmd_new(args.title) if args.command == "new" else cmd_check()


if __name__ == "__main__":
    sys.exit(main())
