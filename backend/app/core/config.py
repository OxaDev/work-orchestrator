"""Application settings, read from environment variables and the repository `.env` file."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# backend/app/core/config.py -> repository root. Missing file is ignored (e.g. in Docker).
_REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"

INSECURE_DEFAULT_SECRET = "insecure-dev-secret-change-me"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ROOT_ENV, extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # Public URL prefix the app is served under (ADR-0011). Empty string means root.
    base_path: str = "/work-orchestrator"

    postgres_host: str = "127.0.0.1"
    postgres_port: int = 55432
    postgres_user: str = "orchestrator"
    postgres_password: SecretStr = SecretStr("orchestrator")
    postgres_db: str = "orchestrator"

    secret_key: SecretStr = SecretStr(INSECURE_DEFAULT_SECRET)

    # Authentication (ADR-0007, ADR-0030).
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    # None = Secure cookies in production only. Browsers accept Secure cookies on localhost.
    cookie_secure: bool | None = None

    # Comma-separated list of allowed origins; empty disables CORS (same-origin deployment).
    cors_origins: str = ""

    uploads_dir: Path = Path("/data/uploads")

    @field_validator("base_path")
    @classmethod
    def normalize_base_path(cls, value: str) -> str:
        """Normalize to "" (root) or "/segment[/segment]" without trailing slash."""
        stripped = value.strip().strip("/")
        return f"/{stripped}" if stripped else ""

    @model_validator(mode="after")
    def refuse_insecure_secret_in_production(self) -> "Settings":
        if (
            self.environment == "production"
            and self.secret_key.get_secret_value() == INSECURE_DEFAULT_SECRET
        ):
            raise ValueError("SECRET_KEY must be set in production (run `make env`).")
        return self

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.environment == "production"

    @property
    def cookie_path(self) -> str:
        """Public path covering the whole app (ADR-0011): "/work-orchestrator" or "/"."""
        return self.base_path or "/"

    @property
    def refresh_cookie_path(self) -> str:
        """The refresh token is only ever sent to the auth endpoints."""
        return f"{self.base_path}/api/v1/auth"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
