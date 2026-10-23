"""Схемы входа, регистрации и профиля."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints

from app.domain.schemas.common import CamelSchema, EmailMixin, PhoneMixin, Schema

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Name = Annotated[str, StringConstraints(min_length=2, max_length=100)]


class RegisterRequest(Schema, EmailMixin, PhoneMixin):
    name: Name
    email: EmailStr
    password: Password
    phone: str | None = None


class LoginRequest(Schema, EmailMixin):
    email: EmailStr
    password: str = Field(min_length=1)


class UpdateProfileRequest(Schema, PhoneMixin):
    name: Name | None = None
    phone: str | None = None


class ChangePasswordRequest(Schema):
    current_password: str = Field(min_length=1, alias="currentPassword")
    new_password: Password = Field(alias="newPassword")


class TelegramWebAppRequest(Schema):
    """Вход из мини-приложения: подпись подтверждает сам Telegram."""

    init_data: str = Field(min_length=1, alias="initData")


class PublicUser(CamelSchema):
    """Профиль в том виде, в каком его ждёт сайт.

    Пароль и служебные поля сюда не попадают по построению: наружу уходит
    только то, что объявлено здесь.
    """

    id: str
    name: str
    email: str | None
    phone: str | None
    role: Literal["user", "admin"]
    email_verified: bool
    telegram_linked: bool
    #: Ключ файла в хранилище; абсолютный адрес собирает слой маршрутов.
    avatar_key: str | None
    created_at: datetime


class SessionResponse(CamelSchema):
    """Что возвращается после входа. Refresh-токен уходит в httpOnly-куке
    и в теле ответа не появляется — иначе его достал бы любой скрипт."""

    user: PublicUser
    access_token: str
