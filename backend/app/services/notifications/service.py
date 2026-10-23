"""Уведомления личного кабинета и разбор упавших задач."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.errors import NotFoundError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.notifications import Notification, OutboxMessage
from app.domain.schemas.notifications import (
    AdminOutboxItem,
    NotificationOut,
    OutboxFilter,
)


@dataclass(frozen=True, slots=True)
class NotificationPage:
    items: list[NotificationOut]
    total: int
    unread: int


class NotificationService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_for(self, user_id: str, *, limit: int, offset: int) -> NotificationPage:
        where = Notification.user_id == user_id
        total = await self._count(where)
        unread = await self._count(where, Notification.read_at.is_(None))

        rows = await self._uow.session.execute(
            select(Notification)
            .where(where)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return NotificationPage(
            items=[NotificationOut.model_validate(row) for row in rows.scalars().all()],
            total=total,
            unread=unread,
        )

    async def mark_read(self, user_id: str, ids: list[str] | None = None) -> None:
        """Без списка помечает прочитанными все.

        Обновление делается одним запросом: читать сотню записей ради того,
        чтобы проставить каждой дату, незачем.
        """
        conditions = [Notification.user_id == user_id, Notification.read_at.is_(None)]
        if ids:
            conditions.append(Notification.id.in_(ids))
        await self._uow.session.execute(
            update(Notification)
            .where(*conditions)
            .values(read_at=datetime.now(UTC))
            .execution_options(synchronize_session=False)
        )

    async def _count(self, *conditions: object) -> int:
        from sqlalchemy import func

        total = await self._uow.session.scalar(
            select(func.count()).select_from(Notification).where(*conditions)  # type: ignore[arg-type]
        )
        return int(total or 0)


class OutboxAdminService:
    """Очередь доставки глазами администратора.

    Нужна ровно для одного: увидеть, что именно не доставлено и почему.
    Без этого упавшие задачи копятся молча, и о пропавшем уведомлении
    узнаёшь от человека, который его не получил.
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_messages(self, filter_: OutboxFilter) -> tuple[list[AdminOutboxItem], int]:
        from sqlalchemy import func

        conditions = []
        if filter_.status:
            conditions.append(OutboxMessage.status == filter_.status)
        if filter_.channel:
            conditions.append(OutboxMessage.channel == filter_.channel)

        total = await self._uow.session.scalar(
            select(func.count()).select_from(OutboxMessage).where(*conditions)
        )
        rows = await self._uow.session.execute(
            select(OutboxMessage)
            .where(*conditions)
            .order_by(OutboxMessage.created_at.desc())
            .limit(filter_.limit)
            .offset(filter_.offset)
        )
        items = [AdminOutboxItem.model_validate(row) for row in rows.scalars().all()]
        return items, int(total or 0)

    async def retry(self, message_id: str) -> OutboxMessage:
        """Возвращает упавшую задачу в очередь.

        Счётчик попыток сбрасывается: если причина была внешней и её
        устранили, задача заслуживает полного набора попыток заново.
        """
        message = await self._uow.session.get(OutboxMessage, message_id)
        if message is None:
            raise NotFoundError("Задача не найдена")

        message.status = "pending"
        message.attempts = 0
        message.last_error = None
        message.scheduled_at = datetime.now(UTC)
        return message
