import json

import pytest

from app.cli import main


def test_openapi_command_prints_schema(capsys: pytest.CaptureFixture[str]) -> None:
    main(["openapi"])
    schema = json.loads(capsys.readouterr().out)
    assert schema["info"]["title"] == "Work Orchestrator API"
    assert "/api/v1/health" in schema["paths"]


def test_unknown_command_exits() -> None:
    with pytest.raises(SystemExit):
        main(["nope"])


def test_cli_registers_every_model_on_its_own() -> None:
    """`python -m app.cli` alone must resolve every foreign key: tests load all models
    anyway, so this runs in a fresh interpreter (regression: users -> companies)."""
    import subprocess
    import sys

    code = (
        "import app.cli\n"
        "from app.shared.models import Base\n"
        "for table in Base.metadata.tables.values():\n"
        "    for fk in table.foreign_keys:\n"
        "        fk.column\n"
    )
    result = subprocess.run(  # noqa: S603 - fixed interpreter and code
        [sys.executable, "-c", code], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
