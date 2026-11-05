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
