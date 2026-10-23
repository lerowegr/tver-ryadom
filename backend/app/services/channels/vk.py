"""Канал ВКонтакте.

Callback API устроен иначе, чем у Telegram: площадка сперва просит
подтвердить адрес, присылая событие `confirmation` и ожидая в ответ
строку из настроек сообщества. Остальные события приходят туда же, и
отвечать на них надо словом «ok» — иначе ВКонтакте считает доставку
неудачной и повторяет событие.
"""

from __future__ import annotations

import json
import secrets
from typing import Any

import httpx

from app.core.unit_of_work import UnitOfWork
from app.services.channels.accounts import ChannelId
from app.services.channels.screens import Button, Screen, ScreenBuilder, plain

API_VERSION = "5.199"
API_URL = "https://api.vk.com/method/messages.send"


class VkChannel:
    def __init__(
        self,
        uow: UnitOfWork,
        screens: ScreenBuilder,
        *,
        group_token: str | None,
        confirmation: str | None,
        secret: str | None,
        client_factory: Any = None,
    ) -> None:
        self._uow = uow
        self._screens = screens
        self._token = group_token
        self._confirmation = confirmation
        self._secret = secret
        self._client_factory = client_factory

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def handle(self, update: dict[str, Any]) -> str:
        """Разбирает событие и возвращает то, что нужно отдать ВКонтакте."""
        kind = update.get("type")

        if kind == "confirmation":
            # Без этого ответа площадка не включит адрес вовсе.
            return self._confirmation or ""

        # Секрет приходит в теле, а не в заголовке. Если он задан, чужое
        # событие принимать нельзя: адрес вебхука открыт всему интернету.
        if self._secret and update.get("secret") != self._secret:
            return "ok"

        if kind == "message_new":
            await self._on_message(update.get("object") or {})

        # Что бы ни случилось — «ok»: иначе ВКонтакте будет слать событие
        # снова и снова, считая доставку неудачной.
        return "ok"

    async def _on_message(self, payload: dict[str, Any]) -> None:
        message = payload.get("message") or payload
        peer_id = message.get("peer_id") or message.get("from_id")
        if peer_id is None:
            return

        action = _action_of(message)
        screen = await self._screens.screen_for(
            action or "menu", ChannelId.VK, str(peer_id), "Гость"
        )
        await self.send(str(peer_id), screen)

    async def send(self, peer_id: str, screen: Screen) -> None:
        if not self._token:
            raise RuntimeError("Токен сообщества не задан — канал ВКонтакте выключен")

        factory = self._client_factory or (lambda: httpx.AsyncClient(timeout=15.0))
        async with factory() as client:
            response = await client.post(
                API_URL,
                data={
                    "access_token": self._token,
                    "v": API_VERSION,
                    "peer_id": peer_id,
                    "message": plain(screen.text),
                    # Без случайного числа ВКонтакте считает повтор дублем
                    # и молча его отбрасывает.
                    "random_id": str(secrets.randbelow(2**31)),
                    "keyboard": json.dumps(_keyboard(screen.buttons), ensure_ascii=False),
                },
            )
        body = response.json()
        if "error" in body:
            raise RuntimeError(f"ВКонтакте: {body['error'].get('error_msg')}")


def _action_of(message: dict[str, Any]) -> str | None:
    """Нажатие кнопки приходит отдельным полем, текст — обычным."""
    payload = message.get("payload")
    if payload:
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
            if isinstance(data, dict) and data.get("action"):
                return str(data["action"])
        except json.JSONDecodeError:
            pass
    return None


def _keyboard(buttons: list[list[Button]]) -> dict[str, Any]:
    return {
        "inline": True,
        "buttons": [
            [
                {
                    "action": {
                        "type": "text",
                        "label": button.label[:40],
                        "payload": json.dumps({"action": button.action}, ensure_ascii=False),
                    },
                    "color": "secondary",
                }
                for button in row
            ]
            for row in buttons
        ],
    }
