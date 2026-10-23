"""Зависимости FastAPI.

Здесь собирается граф объектов: из настроек — хешер и выпуск токенов, из
базы — единица работы, из них вместе — сервисы. Ручная сборка внутри
обработчика означала бы, что тест не может подменить ни один слой.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings
from app.core.database import Database
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import (
    AccessTokenPayload,
    PasswordHasher,
    Pbkdf2PasswordHasher,
    TokenService,
)
from app.core.unit_of_work import UnitOfWork
from app.services.auth import AuthService, SessionMeta
from app.services.availability import AvailabilityService
from app.services.bookings import BookingService
from app.services.images import ImageUrlBuilder
from app.services.notifications import CabinetNotifier, Notifier
from app.services.telegram_webapp import TelegramWebAppVerifier
from app.services.tours import TourCatalogService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings  # type: ignore[no-any-return]


def get_database(request: Request) -> Database:
    return request.app.state.database  # type: ignore[no-any-return]


SettingsDep = Annotated[Settings, Depends(get_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]


async def get_uow(database: DatabaseDep) -> AsyncIterator[UnitOfWork]:
    """Единица работы на запрос.

    Фиксирует обработчик, а не зависимость: иначе ответ уходил бы клиенту
    раньше, чем станет ясно, что транзакция записалась.
    """
    async with UnitOfWork(database.session_factory) as uow:
        yield uow


UowDep = Annotated[UnitOfWork, Depends(get_uow)]


def get_password_hasher() -> PasswordHasher:
    return Pbkdf2PasswordHasher()


def get_token_service(settings: SettingsDep) -> TokenService:
    return TokenService(settings.jwt_secret, settings.access_token_ttl_minutes)


HasherDep = Annotated[PasswordHasher, Depends(get_password_hasher)]
TokensDep = Annotated[TokenService, Depends(get_token_service)]


def get_webapp_verifier(settings: SettingsDep) -> TelegramWebAppVerifier:
    return TelegramWebAppVerifier(settings.telegram_bot_token)


def get_auth_service(
    uow: UowDep,
    hasher: HasherDep,
    tokens: TokensDep,
    settings: SettingsDep,
    webapp: Annotated[TelegramWebAppVerifier, Depends(get_webapp_verifier)],
) -> AuthService:
    return AuthService(
        uow,
        hasher,
        tokens,
        refresh_ttl_days=settings.refresh_token_ttl_days,
        webapp=webapp,
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_image_builder(request: Request, settings: SettingsDep) -> ImageUrlBuilder:
    """База адресов картинок: из настроек, иначе текущий хост API.

    Запасной вариант нужен для локального запуска и тестов, где отдельного
    домена для файлов нет.
    """
    base = settings.images_base_url or str(request.base_url).rstrip("/") + "/images"
    return ImageUrlBuilder(base)


def get_catalog_service(
    uow: UowDep,
    images: Annotated[ImageUrlBuilder, Depends(get_image_builder)],
) -> TourCatalogService:
    return TourCatalogService(uow, images)


CatalogServiceDep = Annotated[TourCatalogService, Depends(get_catalog_service)]


def get_availability_service(uow: UowDep) -> AvailabilityService:
    return AvailabilityService(uow)


AvailabilityServiceDep = Annotated[AvailabilityService, Depends(get_availability_service)]


def get_notifier(uow: UowDep) -> Notifier:
    return CabinetNotifier(uow)


def get_booking_service(
    uow: UowDep,
    availability: AvailabilityServiceDep,
    notifier: Annotated[Notifier, Depends(get_notifier)],
    settings: SettingsDep,
) -> BookingService:
    return BookingService(uow, availability, notifier, site_url=settings.site_url)


BookingServiceDep = Annotated[BookingService, Depends(get_booking_service)]


def get_session_meta(request: Request) -> SessionMeta:
    """Откуда пришёл вход. За обратным прокси настоящий адрес — в заголовке."""
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    return SessionMeta(user_agent=request.headers.get("user-agent"), ip=ip)


SessionMetaDep = Annotated[SessionMeta, Depends(get_session_meta)]


def get_optional_user(request: Request, tokens: TokensDep) -> AccessTokenPayload | None:
    """Разбирает Bearer-токен, но не требует его: гостевой доступ разрешён."""
    header = request.headers.get("authorization")
    if not header or not header.lower().startswith("bearer "):
        return None
    return tokens.verify(header[len("bearer ") :].strip())


OptionalUserDep = Annotated[AccessTokenPayload | None, Depends(get_optional_user)]


def require_user(user: OptionalUserDep) -> AccessTokenPayload:
    if user is None:
        raise UnauthorizedError()
    return user


def require_admin(user: Annotated[AccessTokenPayload, Depends(require_user)]) -> AccessTokenPayload:
    if not user.is_admin:
        raise ForbiddenError()
    return user


CurrentUserDep = Annotated[AccessTokenPayload, Depends(require_user)]
AdminDep = Annotated[AccessTokenPayload, Depends(require_admin)]
