"""Уведомления.

Пока перенесена только внутрисайтовая часть: запись в личный кабинет.
Доставка в мессенджеры и почту идёт через очередь и фоновую задачу — это
отдельный модуль, и он приедет следующим.

Интерфейс объявлен абстрактным не ради красоты: бронирование не должно
знать, чем именно уведомляют, а в тестах нужно проверять, что сервис
вообще позвал уведомления, не отправляя при этом ничего.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.core.unit_of_work import UnitOfWork
from app.domain.models.notifications import Notification


class Notifier(ABC):
    """Куда сообщать о событиях брони."""

    @abstractmethod
    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None: ...

    @abstractmethod
    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None: ...


class CabinetNotifier(Notifier):
    """Пишет уведомления в личный кабинет.

    Внешние каналы сюда добавятся вместе с модулем очереди: записи в
    кабинете и задачи на отправку создаются одной операцией, иначе одно
    без другого расходится.
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        self._uow.session.add(
            Notification(user_id=user_id, type=event, payload=_clean(payload))
        )

    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None:
        admins = await self._uow.users.admins()
        for admin in admins:
            self._uow.session.add(
                Notification(user_id=admin.id, type=event, payload=_clean(payload))
            )


class NullNotifier(Notifier):
    """Ничего не делает — для тестов, которым уведомления не интересны."""

    async def notify_user(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        return None

    async def notify_admins(self, event: str, payload: dict[str, Any]) -> None:
        return None


def _clean(payload: dict[str, Any]) -> dict[str, Any]:
    """Пустые значения в уведомление не кладём: шаблоны подставляют их
    как «undefined», и в письме появляется мусор."""
    return {key: value for key, value in payload.items() if value is not None}
