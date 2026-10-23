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
from app.core.errors import ForbiddenError, UnauthorizedError, ValidationError
from app.core.rate_limit import client_ip
from app.core.security import (
    AccessTokenPayload,
    PasswordHasher,
    Pbkdf2PasswordHasher,
    TokenService,
)
from app.core.unit_of_work import UnitOfWork
from app.services.admin.calendar import AdminCalendarService, DashboardService
from app.services.admin.images import AdminImageService
from app.services.admin.people import (
    AdminBookingService,
    AdminRequestService,
    AdminReviewService,
    AdminUserService,
    SettingsService,
)
from app.services.admin.tours import AdminScheduleService, AdminTourService
from app.services.auth import AuthService, SessionMeta
from app.services.availability import AvailabilityService
from app.services.bookings import BookingService
from app.services.calendar import FeedTokenService
from app.services.captcha import CaptchaVerifier
from app.services.content import ContactService, FavoriteService, ReviewService
from app.services.images import ImageUrlBuilder
from app.services.notifications import Notifier, OutboxNotifier
from app.services.notifications.service import NotificationService, OutboxAdminService
from app.services.storage import MemoryStorage, ObjectStorage, R2Storage
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
    """Уведомления идут и в кабинет, и в очередь доставки — одной записью."""
    return OutboxNotifier(uow)


def get_notification_service(uow: UowDep) -> NotificationService:
    return NotificationService(uow)


def get_outbox_admin_service(uow: UowDep) -> OutboxAdminService:
    return OutboxAdminService(uow)


NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
OutboxAdminServiceDep = Annotated[OutboxAdminService, Depends(get_outbox_admin_service)]


def get_booking_service(
    uow: UowDep,
    availability: AvailabilityServiceDep,
    notifier: Annotated[Notifier, Depends(get_notifier)],
    settings: SettingsDep,
) -> BookingService:
    return BookingService(uow, availability, notifier, site_url=settings.site_url)


BookingServiceDep = Annotated[BookingService, Depends(get_booking_service)]


def get_review_service(uow: UowDep) -> ReviewService:
    return ReviewService(uow)


def get_favorite_service(uow: UowDep, catalog: CatalogServiceDep) -> FavoriteService:
    return FavoriteService(uow, catalog)


def get_contact_service(
    uow: UowDep, notifier: Annotated[Notifier, Depends(get_notifier)]
) -> ContactService:
    return ContactService(uow, notifier)


ReviewServiceDep = Annotated[ReviewService, Depends(get_review_service)]
FavoriteServiceDep = Annotated[FavoriteService, Depends(get_favorite_service)]
ContactServiceDep = Annotated[ContactService, Depends(get_contact_service)]


# ---- Административные службы ------------------------------------------------


def get_admin_tour_service(
    uow: UowDep, images: Annotated[ImageUrlBuilder, Depends(get_image_builder)]
) -> AdminTourService:
    return AdminTourService(uow, images)


def get_admin_schedule_service(uow: UowDep) -> AdminScheduleService:
    return AdminScheduleService(uow)


def get_admin_booking_service(uow: UowDep) -> AdminBookingService:
    return AdminBookingService(uow)


def get_admin_review_service(uow: UowDep) -> AdminReviewService:
    return AdminReviewService(uow)


def get_admin_request_service(uow: UowDep) -> AdminRequestService:
    return AdminRequestService(uow)


def get_admin_user_service(uow: UowDep, hasher: HasherDep) -> AdminUserService:
    return AdminUserService(uow, hasher)


def get_settings_service(uow: UowDep) -> SettingsService:
    return SettingsService(uow)


def get_admin_calendar_service(uow: UowDep) -> AdminCalendarService:
    return AdminCalendarService(uow)


def get_dashboard_service(uow: UowDep) -> DashboardService:
    return DashboardService(uow)


def get_feed_token_service(uow: UowDep) -> FeedTokenService:
    return FeedTokenService(uow)


def get_storage(request: Request, settings: SettingsDep) -> ObjectStorage:
    """Хранилище живёт на приложении: клиент boto3 тяжело создавать на
    каждый запрос, а в тестах вместо него подставляется память."""
    existing = getattr(request.app.state, "storage", None)
    if existing is not None:
        return existing  # type: ignore[no-any-return]
    storage: ObjectStorage = R2Storage(settings) if settings.storage_configured else MemoryStorage()
    request.app.state.storage = storage
    return storage


StorageDep = Annotated[ObjectStorage, Depends(get_storage)]


def get_admin_image_service(
    uow: UowDep,
    storage: StorageDep,
    images: Annotated[ImageUrlBuilder, Depends(get_image_builder)],
) -> AdminImageService:
    return AdminImageService(uow, storage, images)


AdminImageServiceDep = Annotated[AdminImageService, Depends(get_admin_image_service)]


AdminTourServiceDep = Annotated[AdminTourService, Depends(get_admin_tour_service)]
AdminScheduleServiceDep = Annotated[AdminScheduleService, Depends(get_admin_schedule_service)]
AdminBookingServiceDep = Annotated[AdminBookingService, Depends(get_admin_booking_service)]
AdminReviewServiceDep = Annotated[AdminReviewService, Depends(get_admin_review_service)]
AdminRequestServiceDep = Annotated[AdminRequestService, Depends(get_admin_request_service)]
AdminUserServiceDep = Annotated[AdminUserService, Depends(get_admin_user_service)]
SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]
AdminCalendarServiceDep = Annotated[AdminCalendarService, Depends(get_admin_calendar_service)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
FeedTokenServiceDep = Annotated[FeedTokenService, Depends(get_feed_token_service)]


def get_captcha(settings: SettingsDep) -> CaptchaVerifier:
    return CaptchaVerifier(settings.turnstile_secret)


class RequireCaptcha:
    """Проверяет капчу у гостя. Вошедшему она не нужна.

    Токен берётся из тела запроса, поэтому зависимость читает его сама:
    объявлять его отдельным параметром в каждом обработчике значило бы
    повторять одно и то же четыре раза.
    """

    async def __call__(
        self,
        request: Request,
        user: OptionalUserDep,
        captcha: Annotated[CaptchaVerifier, Depends(get_captcha)],
    ) -> None:
        if user is not None or not captcha.enabled:
            return

        token: str | None = None
        try:
            body = await request.json()
            if isinstance(body, dict):
                token = body.get("cfToken")
        except Exception:
            token = None

        if not await captcha.verify(token, ip=client_ip(request)):
            raise ValidationError(
                "Проверка не пройдена. Обновите страницу и попробуйте снова."
            )


require_captcha = RequireCaptcha()


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
