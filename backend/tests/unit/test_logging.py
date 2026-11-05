import json
import logging

from app.core.logging import JsonFormatter, configure_logging


def test_json_formatter_outputs_one_json_object() -> None:
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    payload = json.loads(JsonFormatter().format(record))
    assert payload["message"] == "hello world"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "x"


def test_json_formatter_includes_exception() -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        record = logging.LogRecord("x", logging.ERROR, __file__, 1, "failed", (), sys.exc_info())
    payload = json.loads(JsonFormatter().format(record))
    assert "ValueError: boom" in payload["exc_info"]


def test_configure_logging_sets_level() -> None:
    configure_logging("debug")
    assert logging.getLogger().level == logging.DEBUG
    configure_logging("WARNING")
