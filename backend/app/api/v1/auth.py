"""Маршруты входа, регистрации и профиля."""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, File, Response, UploadFile, status

from app.api.deps import (
    AuthServiceDep,
    CurrentUserDep,
    ImageBuilderDep,
    SessionMetaDep,
    SettingsDep,
    StorageDep,
    TelegramSetupDep,
    UowDep,
    require_captcha,
)
from app.core.config import Settings
from app.core.errors import UnauthorizedError, ValidationError
from app.core.rate_limit import RULES, RateLimit
from app.core.responses import Envelope, ok
from app.domain.schemas.auth import (
    AvatarOut,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    PublicUser,
    RegisterRequest,
    SessionOut,
    SessionResponse,
    TelegramLink,
    TelegramWebAppRequest,
    UpdateProfileRequest,
)
from app.services.admin.images import ImageProcessor
from app.services.auth import IssuedSession
from app.services.link_codes import link_codes

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
#: Кука ограничена разделом входа: на остальные запросы её слать незачем.
REFRESH_COOKIE_PATH = "/api/v1/auth"
#: Аватар — маленькая картинка; два мегабайта с запасом.
AVATAR_MAX_SIZE = 2 * 1024 * 1024


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        # SameSite=None без Secure браузер молча выбрасывает.
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path=REFRESH_COOKIE_PATH,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
    )


def _session_response(
    issued: IssuedSession, response: Response, settings: Settings
) -> Envelope[SessionResponse]:
    _set_refresh_cookie(response, issued.refresh_token, settings)
    return ok(SessionResponse(user=issued.user, access_token=issued.access_token))


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit(RULES["register"]))],
)
async def register(
    data: RegisterRequest,
    response: Response,
    service: AuthServiceDep,
    meta: SessionMetaDep,
    settings: SettingsDep,
    uow: UowDep,
) -> Envelope[SessionResponse]:
    issued = await service.register(data, meta)
    await uow.commit()
    return _session_response(issued, response, settings)


@router.post("/login", dependencies=[Depends(RateLimit(RULES["login"]))])
async def login(
    data: LoginRequest,
    response: Response,
    service: AuthServiceDep,
    meta: SessionMetaDep,
    settings: SettingsDep,
    uow: UowDep,
) -> Envelope[SessionResponse]:
    issued = await service.login(data, meta)
    await uow.commit()
    return _session_response(issued, response, settings)


@router.post(
    "/telegram-webapp",
    dependencies=[Depends(RateLimit(RULES["telegram_webapp"]))],
)
async def login_by_webapp(
    data: TelegramWebAppRequest,
    response: Response,
    service: AuthServiceDep,
    meta: SessionMetaDep,
    settings: SettingsDep,
    uow: UowDep,
) -> Envelope[SessionResponse]:
    issued = await service.login_by_webapp(data.init_data, meta)
    await uow.commit()
    return _session_response(issued, response, settings)


@router.post("/refresh")
async def refresh(
    response: Response,
    service: AuthServiceDep,
    settings: SettingsDep,
    uow: UowDep,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> Envelope[SessionResponse]:
    if not refresh_token:
        raise UnauthorizedError("Сессия истекла, войдите заново")
    issued = await service.refresh(refresh_token)
    await uow.commit()
    return _session_response(issued, response, settings)


@router.post("/logout")
async def logout(
    response: Response,
    service: AuthServiceDep,
    uow: UowDep,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> Envelope[dict[str, bool]]:
    if refresh_token:
        await service.logout(refresh_token)
        await uow.commit()
    # Куку убираем в любом случае: выход должен срабатывать и тогда, когда
    # сессия на сервере уже протухла.
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
    return ok({"ok": True})


@router.get("/me")
async def me(user: CurrentUserDep, service: AuthServiceDep) -> Envelope[PublicUser]:
    return ok(await service.get_profile(user.user_id))


@router.patch("/profile")
async def update_me(
    data: UpdateProfileRequest,
    user: CurrentUserDep,
    service: AuthServiceDep,
    uow: UowDep,
) -> Envelope[PublicUser]:
    profile = await service.update_profile(user.user_id, data)
    await uow.commit()
    return ok(profile)


@router.get("/sessions")
async def list_sessions(
    user: CurrentUserDep, service: AuthServiceDep
) -> Envelope[list[SessionOut]]:
    sessions = await service.list_sessions(user.user_id)
    return ok([SessionOut.model_validate(item) for item in sessions])


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str, user: CurrentUserDep, service: AuthServiceDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.revoke_session(user.user_id, session_id)
    await uow.commit()
    return ok({"revoked": True})


@router.post(
    "/password-reset/request",
    dependencies=[Depends(RateLimit(RULES["password_reset"])), Depends(require_captcha)],
)
async def request_password_reset(
    data: PasswordResetRequest,
    service: AuthServiceDep,
    settings: SettingsDep,
    uow: UowDep,
) -> Envelope[dict[str, bool]]:
    """Ответ всегда один и тот же.

    Разные ответы на знакомый и незнакомый адрес позволяли бы перебором
    узнать, кто зарегистрирован.
    """
    await service.request_password_reset(data.email, site_url=settings.site_url)
    await uow.commit()
    return ok({"requested": True})


@router.post(
    "/password-reset/confirm",
    dependencies=[Depends(RateLimit(RULES["password_reset"]))],
)
async def confirm_password_reset(
    data: PasswordResetConfirm,
    response: Response,
    service: AuthServiceDep,
    meta: SessionMetaDep,
    settings: SettingsDep,
    uow: UowDep,
) -> Envelope[SessionResponse]:
    issued = await service.confirm_password_reset(data.token, data.password, meta)
    await uow.commit()
    return _session_response(issued, response, settings)


@router.get("/telegram-link")
async def telegram_link(
    user: CurrentUserDep, setup: TelegramSetupDep, settings: SettingsDep
) -> Envelope[TelegramLink]:
    """Ссылка для привязки Telegram к учётной записи.

    Имя бота записывает подключение в админке; пока бот не подключён,
    кнопку в кабинете показывать нечему.
    """
    username = settings.telegram_bot_username or await setup.username()
    if not username:
        return ok(TelegramLink(available=False))

    code = link_codes(settings.jwt_secret).create(user.user_id)
    return ok(TelegramLink(available=True, url=f"https://t.me/{username}?start={code}"))


@router.post("/avatar")
async def upload_avatar(
    user: CurrentUserDep,
    storage: StorageDep,
    images: ImageBuilderDep,
    uow: UowDep,
    file: Annotated[UploadFile, File()],
) -> Envelope[AvatarOut]:
    """Аватар. Кадрирует человек в кабинете, сюда приходит готовый квадрат.

    Ключ всегда один и тот же, поэтому старый файл перезаписывается и
    мусор в хранилище не копится.
    """
    data = await file.read()
    checked = ImageProcessor().check(data)
    if len(data) > AVATAR_MAX_SIZE:
        raise ValidationError("Аватар больше 2 МБ")

    key = f"avatars/{user.user_id}.webp"
    await storage.put(key, checked.data, checked.content_type)

    account = await uow.users.get(user.user_id)
    if account is not None:
        account.avatar_key = key
    await uow.commit()
    # Метка времени в адресе: иначе браузер покажет прежнюю картинку
    # из кэша, и человек решит, что загрузка не сработала.
    return ok(AvatarOut(avatar_url=f"{images.url(key)}?v={int(time.time())}"))


@router.delete("/avatar")
async def delete_avatar(
    user: CurrentUserDep, storage: StorageDep, uow: UowDep
) -> Envelope[AvatarOut]:
    key = f"avatars/{user.user_id}.webp"
    await storage.delete(key)
    account = await uow.users.get(user.user_id)
    if account is not None:
        account.avatar_key = None
    await uow.commit()
    return ok(AvatarOut(avatar_url=None))


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user: CurrentUserDep,
    service: AuthServiceDep,
    uow: UowDep,
) -> Envelope[dict[str, bool]]:
    await service.change_password(user.user_id, user.session_id, data)
    await uow.commit()
    return ok({"ok": True})
