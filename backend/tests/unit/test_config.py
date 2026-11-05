import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings


@pytest.fixture(autouse=True)
def _isolated_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Settings in these tests must not depend on the developer's .env or shell."""
    for name in ("SECRET_KEY", "ENVIRONMENT", "BASE_PATH", "CORS_ORIGINS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("/work-orchestrator", "/work-orchestrator"),
        ("work-orchestrator/", "/work-orchestrator"),
        ("/", ""),
        ("", ""),
        ("  /a/b/  ", "/a/b"),
    ],
)
def test_base_path_is_normalized(raw: str, expected: str) -> None:
    assert Settings(base_path=raw).base_path == expected


def test_database_url_uses_asyncpg_and_settings() -> None:
    settings = Settings(
        postgres_host="db",
        postgres_port=5432,
        postgres_user="u",
        postgres_password=SecretStr("p"),
        postgres_db="d",
    )
    url = settings.database_url
    assert url.drivername == "postgresql+asyncpg"
    assert (url.host, url.port, url.username, url.database) == ("db", 5432, "u", "d")
    assert url.password == "p"  # noqa: S105


def test_cors_origin_list_splits_and_trims() -> None:
    assert Settings(cors_origins=" http://a , ,http://b").cors_origin_list == [
        "http://a",
        "http://b",
    ]
    assert Settings(cors_origins="").cors_origin_list == []


def test_production_refuses_default_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production")


def test_production_accepts_explicit_secret() -> None:
    settings = Settings(environment="production", secret_key=SecretStr("x" * 40))
    assert settings.environment == "production"
