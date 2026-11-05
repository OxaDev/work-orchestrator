import pytest

from app.shared.text import clean, normalize_text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Société   Générale ", "societe generale"),
        ("ÉLODIE", "elodie"),
        ("Straße", "strasse"),
        ("Node.js", "node.js"),
        ("", ""),
    ],
)
def test_normalize_text(raw: str, expected: str) -> None:
    assert normalize_text(raw) == expected


@pytest.mark.parametrize(("raw", "expected"), [(None, None), ("  ", None), (" a ", "a")])
def test_clean(raw: str | None, expected: str | None) -> None:
    assert clean(raw) == expected
