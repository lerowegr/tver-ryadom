"""Кому и как сообщать о событиях.

Интерфейс абстрактный не ради красоты: бронирование не должно знать, чем
именно уведомляют, а в тестах нужно проверять, что сервис вообще позвал
уведомления, ничего при этом не отправляя.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from app.core.unit_of_work import UnitOfWork
from app.domain.models.auth import User
from app.domain.models.notifications import Notification, OutboxMessage


class Notifier(ABC):
    """Куда сообщать о событиях."""

    @abstractmethod
    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None: ...

    @abstractmethod
    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None: ...


class CabinetNotifier(Notifier):
    """Только записи в личный кабинет — их человек видит на сайте."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        self._uow.session.add(Notification(user_id=user_id, type=event, payload=clean(payload)))

    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None:
        for admin in await self._uow.users.admins():
            self._uow.session.add(
                Notification(user_id=admin.id, type=event, payload=clean(payload))
            )


class OutboxNotifier(CabinetNotifier):
    """Кабинет плюс очередь доставки во внешние каналы.

    Запись в кабинет и задачи на отправку создаются одной операцией: если
    развести их по разным транзакциям, однажды появится уведомление,
    которое человек видит на сайте, но не получил ни письмом, ни
    сообщением, — и наоборот.

    Сама отправка происходит позже, в фоновой задаче. Делать её прямо
    в обработчике запроса нельзя: недоступный Telegram подвесил бы
    бронирование на таймаут, а гость увидел бы ошибку там, где всё
    на самом деле записалось.
    """

    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        await super().notify_user(user_id, event, payload)
        user = await self._uow.users.get(user_id)
        if user is not None:
            self._enqueue_for(user, event, payload)

    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None:
        await super().notify_admins(event, payload)
        for admin in await self._uow.users.admins():
            # Администратору — только в Telegram: письма о каждой заявке
            # превратились бы в поток, который перестают читать.
            if admin.telegram_chat_id:
                self._enqueue("telegram", admin.telegram_chat_id, event, payload)

    def _enqueue_for(self, user: User, event: str, payload: dict[str, Any]) -> None:
        if user.telegram_chat_id:
            self._enqueue("telegram", user.telegram_chat_id, event, payload)
        if user.email:
            self._enqueue("email", user.email, event, payload)

    def _enqueue(
        self, channel: str, recipient: str, event: str, payload: dict[str, Any]
    ) -> None:
        self._uow.session.add(
            OutboxMessage(
                channel=channel,
                recipient=recipient,
                template=event,
                payload=clean(payload),
                scheduled_at=datetime.now(UTC),
            )
        )


class NullNotifier(Notifier):
    """Ничего не делает — для тестов, которым уведомления не интересны."""

    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        return None

    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None:
        return None


def clean(payload: dict[str, Any]) -> dict[str, Any]:
    """Пустые значения в уведомление не кладём: шаблон подставил бы их
    как «None», и в письме появился бы мусор."""
    return {key: value for key, value in payload.items() if value is not None}
