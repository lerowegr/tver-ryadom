"""Подключение бота Telegram к серверу.

Обработчик вебхука мало написать — нужно ещё сказать Telegram его адрес,
иначе бот будет молчать и с верным токеном. Это делает кнопка в админке,
и токен при этом не покидает сервер: наружу он не передаётся ни разу.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from app.core.unit_of_work import UnitOfWork
from app.domain.models.content import Setting
from app.services.channels.telegram import TelegramApi

SECRET_KEY = "telegram.webhookSecret"
USERNAME_KEY = "telegram.username"

#: Меню команд — то самое синее «Меню» рядом с полем ввода.
COMMANDS = [
    {"command": "menu", "description": "Главное меню"},
    {"command": "tours", "description": "Экскурсии с фото и ценами"},
    {"command": "mybookings", "description": "Мои брони"},
    {"command": "me", "description": "Личный кабинет"},
    {"command": "help", "description": "Про экскурсии и Елену"},
]


@dataclass(frozen=True, slots=True)
class BotStatus:
    token_set: bool
    #: Длина токена, а не он сам. Нужна ровно для одного случая: секрет
    #: задан, а код его не видит — ноль означает пустое значение.
    token_length: int
    username: str | None
    webhook_url: str | None
    pending_updates: int | None
    last_error: str | None


class TelegramSetupService:
    def __init__(self, uow: UnitOfWork, api: TelegramApi, token: str | None) -> None:
        self._uow = uow
        self._api = api
        self._token = token

    async def username(self) -> str | None:
        return await self._read(USERNAME_KEY)

    async def read_secret(self) -> str | None:
        setting = await self._uow.session.get(Setting, SECRET_KEY)
        return setting.value if setting and isinstance(setting.value, str) else None

    async def ensure_secret(self) -> str:
        """Секрет в адресе вебхука.

        Заводим свой, если его нет: так для запуска бота достаточно одного
        токена, а не двух секретов подряд.
        """
        existing = await self.read_secret()
        if existing:
            return existing
        secret = secrets.token_hex(24)
        await self._write(SECRET_KEY, secret)
        return secret

    async def status(self) -> BotStatus:
        if not self._token:
            return BotStatus(
                token_set=False,
                token_length=0,
                username=await self._read(USERNAME_KEY),
                webhook_url=None,
                pending_updates=None,
                last_error=None,
            )
        try:
            info = await self._api.call("getWebhookInfo", {})
        except RuntimeError as error:
            return BotStatus(
                token_set=True,
                token_length=len(self._token),
                username=await self._read(USERNAME_KEY),
                webhook_url=None,
                pending_updates=None,
                last_error=str(error),
            )
        return BotStatus(
            token_set=True,
            token_length=len(self._token),
            username=await self._read(USERNAME_KEY),
            webhook_url=info.get("url") or None,
            pending_updates=info.get("pending_update_count", 0),
            last_error=info.get("last_error_message"),
        )

    async def configure(self, origin: str, site_url: str | None) -> BotStatus:
        """Регистрирует вебхук, заполняет меню команд и запоминает имя."""
        if not self._token:
            raise RuntimeError("Токен бота не задан")

        me = await self._api.call("getMe", {})
        if me.get("username"):
            await self._write(USERNAME_KEY, me["username"])

        secret = await self.ensure_secret()
        await self._api.call(
            "setWebhook",
            {
                "url": f"{origin.rstrip('/')}/webhook/telegram/{secret}",
                "allowed_updates": ["message", "callback_query"],
                # Копившиеся без вебхука обновления отвечать поздно.
                "drop_pending_updates": True,
            },
        )
        await self._api.call("setMyCommands", {"commands": COMMANDS})

        # Кнопка рядом с полем ввода открывает мини-приложение. Только по
        # https: на http Telegram её просто не создаст.
        if site_url and site_url.startswith("https://"):
            menu_button = {
                "type": "web_app",
                "text": "Экскурсии",
                "web_app": {"url": site_url},
            }
        else:
            menu_button = {"type": "commands"}
        await self._api.call("setChatMenuButton", {"menu_button": menu_button})

        return await self.status()

    async def disable(self) -> BotStatus:
        if not self._token:
            raise RuntimeError("Токен бота не задан")
        await self._api.call("deleteWebhook", {"drop_pending_updates": True})
        return await self.status()

    async def _read(self, key: str) -> str | None:
        setting = await self._uow.session.get(Setting, key)
        return setting.value if setting and isinstance(setting.value, str) else None

    async def _write(self, key: str, value: str) -> None:
        setting = await self._uow.session.get(Setting, key)
        if setting is None:
            self._uow.session.add(Setting(key=key, value=value))
        else:
            setting.value = value
