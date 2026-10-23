"""Маршруты входа, регистрации и профиля."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Response, status

from app.api.deps import (
    AuthServiceDep,
    CurrentUserDep,
    SessionMetaDep,
    SettingsDep,
    UowDep,
)
from app.core.config import Settings
from app.core.errors import UnauthorizedError
from app.core.rate_limit import RULES, RateLimit
from app.core.responses import Envelope, ok
from app.domain.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    PublicUser,
    RegisterRequest,
    SessionResponse,
    TelegramWebAppRequest,
    UpdateProfileRequest,
)
from app.services.auth import IssuedSession

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
#: Кука ограничена разделом входа: на остальные запросы её слать незачем.
REFRESH_COOKIE_PATH = "/api/v1/auth"


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


@router.patch("/me")
async def update_me(
    data: UpdateProfileRequest,
    user: CurrentUserDep,
    service: AuthServiceDep,
    uow: UowDep,
) -> Envelope[PublicUser]:
    profile = await service.update_profile(user.user_id, data)
    await uow.commit()
    return ok(profile)


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
