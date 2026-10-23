"""Отправка во внешние каналы.

Каждый канал — отдельный класс с общим интерфейсом: так очередь не знает,
чем именно отправляет, а в тестах вместо сети подставляется заглушка,
которая просто копит отправленное.

Выключенный канал бросает исключение, а не молчит: задача останется
в очереди и попадёт в раздел упавших. Молчаливое «ничего не делаем»
выглядело бы как успешная доставка.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from app.services.notifications.templates import RenderedMessage

#: Сетевые вызовы не должны подвешивать разбор очереди.
TIMEOUT = httpx.Timeout(10.0)


class MessageSender(ABC):
    """Канал доставки."""

    #: Имя канала в очереди.
    channel: str

    @property
    @abstractmethod
    def enabled(self) -> bool: ...

    @abstractmethod
    async def send(self, recipient: str, message: RenderedMessage) -> None: ...


class TelegramSender(MessageSender):
    channel = "telegram"

    def __init__(self, bot_token: str | None) -> None:
        self._token = bot_token

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def send(self, recipient: str, message: RenderedMessage) -> None:
        if not self._token:
            raise RuntimeError("Токен бота не задан — канал Telegram выключен")

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{self._token}/sendMessage",
                json={
                    "chat_id": recipient,
                    "text": message.text,
                    "parse_mode": "HTML",
                    # Ссылка в уведомлении разворачивалась бы в карточку
                    # и занимала пол-экрана.
                    "disable_web_page_preview": True,
                },
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Telegram sendMessage {response.status_code}: {response.text[:200]}"
            )


class EmailSender(MessageSender):
    """Транзакционные письма через Resend."""

    channel = "email"

    def __init__(self, api_key: str | None, sender: str | None) -> None:
        self._api_key = api_key
        self._from = sender or "Тверь рядом <onboarding@resend.dev>"

    @property
    def enabled(self) -> bool:
        return bool(self._api_key)

    async def send(self, recipient: str, message: RenderedMessage) -> None:
        if not self._api_key:
            raise RuntimeError("Ключ Resend не задан — канал email выключен")

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "from": self._from,
                    "to": [recipient],
                    "subject": message.subject,
                    "html": message.html,
                },
            )
        if response.status_code >= 400:
            raise RuntimeError(f"Resend {response.status_code}: {response.text[:200]}")


class SenderRegistry:
    """Набор каналов, по имени."""

    def __init__(self, *senders: MessageSender) -> None:
        self._senders = {sender.channel: sender for sender in senders}

    def get(self, channel: str) -> MessageSender | None:
        return self._senders.get(channel)

    @property
    def channels(self) -> list[str]:
        return sorted(self._senders)
