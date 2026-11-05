"""Text normalisation used for uniqueness and duplicate detection."""

import re
import unicodedata

_SPACES = re.compile(r"\s+")


def normalize_text(value: str) -> str:
    """Case-, accent- and whitespace-insensitive key.

    "  Société  Générale " -> "societe generale"
    """
    decomposed = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _SPACES.sub(" ", without_accents).strip().casefold()


def clean(value: str | None) -> str | None:
    """Trims a free-text field; empty strings become None."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
