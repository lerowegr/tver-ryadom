"""Настройки приложения.

В версии на Workers это был интерфейс `Bindings`: Cloudflare подставлял
туда привязки и секреты. Здесь то же самое читается из окружения, но
становится обычным объектом — его можно передать в конструктор, подменить
в тесте и провалидировать на старте, а не ловить `undefined` в проде.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "production", "test"] = "development"

    # ---- База и хранилище ------------------------------------------------

    database_url: PostgresDsn | str = Field(
        default="postgresql+asyncpg://tver:tver@localhost:5432/tver",
        description="DSN PostgreSQL. В тестах подменяется на sqlite+aiosqlite.",
    )
    database_echo: bool = False

    # Фотографии остаются в R2: у него S3-совместимый API, переезжать незачем.
    r2_endpoint_url: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str = "tver-images"

    # ---- Безопасность ----------------------------------------------------

    jwt_secret: str = Field(default="dev-secret-change-me", min_length=8)
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    @field_validator("jwt_secret")
    @classmethod
    def _reject_default_secret_in_production(cls, value: str, info: object) -> str:
        # Проверку окружения делает `check_production_ready()`: валидатор поля
        # не видит остальные значения, а падать на дефолте в разработке нельзя.
        return value

    # ---- Сеть ------------------------------------------------------------

    cors_origins: list[str] = Field(default_factory=list)
    site_url: str = "http://localhost:3000"
    images_base_url: str | None = None
    #: На своём домене хватает "lax"; "none" нужен был на *.workers.dev,
    #: где поддомены считаются разными сайтами.
    cookie_samesite: Literal["lax", "none", "strict"] = "lax"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Переменная окружения приходит строкой через запятую."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    # ---- Каналы ----------------------------------------------------------

    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = None
    telegram_webhook_secret: str | None = None
    vk_group_token: str | None = None
    vk_confirmation: str | None = None
    vk_secret: str | None = None
    max_bot_token: str | None = None
    max_api_base: str | None = None
    resend_api_key: str | None = None
    email_from: str | None = None

    # ---- Производные значения -------------------------------------------

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cookie_secure(self) -> bool:
        # SameSite=None без Secure браузер просто выбросит.
        return self.cookie_samesite == "none" or self.is_production

    @property
    def storage_configured(self) -> bool:
        return bool(self.r2_endpoint_url and self.r2_access_key_id and self.r2_secret_access_key)

    def check_production_ready(self) -> None:
        """Ошибки конфигурации должны падать на старте, а не на первом запросе."""
        if not self.is_production:
            return
        problems: list[str] = []
        if self.jwt_secret == "dev-secret-change-me":
            problems.append("JWT_SECRET остался отладочным")
        if not self.cors_origins:
            problems.append("CORS_ORIGINS пуст — браузер не пустит сайт к API")
        if not self.storage_configured:
            problems.append("не заданы доступы к R2 — фотографии не загрузятся")
        if problems:
            raise RuntimeError("Неполная конфигурация: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    """Настройки читаются один раз за процесс; в тестах кэш сбрасывается."""
    return Settings()
