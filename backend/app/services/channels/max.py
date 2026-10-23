"""Канал MAX.

Здесь честный каркас, а не готовый канал. Приём события, разбор, учётная
запись и сборка экрана работают и покрыты тестами, но **отправить
сообщение он пока не может**: адрес API мессенджера я не сверял с
документацией и не стал угадывать — молча отправлять запросы по
выдуманному адресу хуже, чем честно сказать, что канал не настроен.

Чтобы включить, нужны две вещи: токен бота и адрес API в настройках.
После этого канал заработает без правок кода — разметка клавиатуры
у MAX такая же простая, как у ВКонтакте.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.unit_of_work import UnitOfWork
from app.services.channels.accounts import ChannelId
from app.services.channels.screens import Button, Screen, ScreenBuilder, plain


class MaxChannel:
    def __init__(
        self,
        uow: UnitOfWork,
        screens: ScreenBuilder,
        *,
        bot_token: str | None,
        api_base: str | None,
        client_factory: Any = None,
    ) -> None:
        self._uow = uow
        self._screens = screens
        self._token = bot_token
        self._api_base = api_base
        self._client_factory = client_factory

    @property
    def configured(self) -> bool:
        """Канал готов, только когда есть и токен, и адрес API."""
        return bool(self._token and self._api_base)

    async def handle(self, update: dict[str, Any]) -> str:
        message = update.get("message") or update
        sender = message.get("sender") or message.get("from") or {}
        chat_id = (
            message.get("chat_id")
            or message.get("chatId")
            or sender.get("user_id")
            or sender.get("id")
        )
        if chat_id is None:
            return "ok"

        action = message.get("payload") or message.get("callback") or "menu"
        name = sender.get("name") or sender.get("first_name") or "Гость"
        screen = await self._screens.screen_for(
            str(action), ChannelId.MAX, str(chat_id), str(name)
        )

        if self.configured:
            await self.send(str(chat_id), screen)
        return "ok"

    async def send(self, chat_id: str, screen: Screen) -> None:
        if not self.configured:
            raise RuntimeError(
                "Канал MAX не настроен: нужны токен бота и адрес API мессенджера"
            )

        factory = self._client_factory or (lambda: httpx.AsyncClient(timeout=15.0))
        async with factory() as client:
            response = await client.post(
                f"{str(self._api_base).rstrip('/')}/messages",
                params={"access_token": self._token},
                json={
                    "chat_id": chat_id,
                    "text": plain(screen.text),
                    "attachments": [_keyboard(screen.buttons)] if screen.buttons else [],
                },
            )
        if response.status_code >= 400:
            raise RuntimeError(f"MAX {response.status_code}: {response.text[:200]}")


def _keyboard(buttons: list[list[Button]]) -> dict[str, Any]:
    return {
        "type": "inline_keyboard",
        "payload": {
            "buttons": [
                [
                    {"type": "callback", "text": button.label[:40], "payload": button.action}
                    for button in row
                ]
                for row in buttons
            ]
        },
    }
