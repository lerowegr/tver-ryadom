"""Один человек — одна запись на все каналы.

Синхронизация между сайтом, Telegram, ВКонтакте и MAX — не отдельный
механизм: это буквально одна строка в таблице пользователей с тремя
идентификаторами. Бронь, избранное и профиль привязаны к ней, поэтому что
бы человек ни менял и откуда бы ни пришёл — данные общие.
"""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import update

from app.core.unit_of_work import UnitOfWork
from app.domain.models.auth import User


class ChannelId(StrEnum):
    TELEGRAM = "telegram"
    VK = "vk"
    MAX = "max"


CHANNEL_LABELS = {
    ChannelId.TELEGRAM: "Telegram",
    ChannelId.VK: "ВКонтакте",
    ChannelId.MAX: "MAX",
}

#: В какой колонке лежит идентификатор человека в этом канале.
COLUMNS = {
    ChannelId.TELEGRAM: User.telegram_chat_id,
    ChannelId.VK: User.vk_user_id,
    ChannelId.MAX: User.max_user_id,
}

FIELDS = {
    ChannelId.TELEGRAM: "telegram_chat_id",
    ChannelId.VK: "vk_user_id",
    ChannelId.MAX: "max_user_id",
}


class AccountService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def find(self, channel: ChannelId, external_id: str) -> User | None:
        return await self._uow.users.find_one(COLUMNS[channel] == external_id)

    async def ensure(self, channel: ChannelId, external_id: str, display_name: str) -> User:
        """Находит или заводит запись.

        Заводим лениво — когда она действительно нужна: открыл кабинет,
        добавил в избранное, оформил бронь. Иначе каждый заглянувший
        оставлял бы после себя пустого пользователя.
        """
        existing = await self.find(channel, external_id)
        if existing is not None:
            return existing

        user = User(
            name=(display_name or "").strip() or "Гость",
            # Ни почты, ни пароля: запись создана из мессенджера. Войти на
            # сайт можно, задав пароль восстановлением.
            email=None,
            password_hash=None,
        )
        setattr(user, FIELDS[channel], external_id)
        self._uow.users.add(user)
        await self._uow.flush()
        return user

    async def link(self, channel: ChannelId, external_id: str, user_id: str) -> None:
        """Привязывает канал к существующей записи.

        Один идентификатор канала принадлежит только одному человеку,
        поэтому сперва отвязываем его ото всех прочих: иначе уникальный
        индекс не даст сохранить, а человек увидит невнятную ошибку.
        """
        field = FIELDS[channel]
        await self._uow.session.execute(
            update(User).where(COLUMNS[channel] == external_id).values(**{field: None})
        )
        await self._uow.session.execute(
            update(User).where(User.id == user_id).values(**{field: external_id})
        )

    async def linked_channels(self, user_id: str) -> list[ChannelId]:
        user = await self._uow.users.get(user_id)
        if user is None:
            return []
        return [
            channel
            for channel in ChannelId
            if getattr(user, FIELDS[channel], None)
        ]
