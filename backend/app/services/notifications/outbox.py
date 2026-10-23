"""Разбор очереди доставки.

Вызывается фоновой задачей раз в минуту. На Workers это делал Cron
Trigger, здесь — планировщик внутри процесса.

Очередь в базе, а не брокер, досталась от бесплатного тарифа: держать
Redis было негде. На своём сервере брокер уже возможен, но очередь
в таблице переживает перезапуск, видна глазами в админке и не добавляет
ещё одну службу, за которой нужно следить.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.unit_of_work import UnitOfWork
from app.domain.models.notifications import OutboxMessage
from app.integrations.senders import SenderRegistry
from app.services.notifications.templates import render

#: Сколько задач берём за один проход. Больше — и минутный тик рискует
#: не успеть закончиться до следующего.
BATCH_SIZE = 20


@dataclass(frozen=True, slots=True)
class OutboxReport:
    picked: int
    sent: int
    failed: int

    def as_dict(self) -> dict[str, int]:
        return {"picked": self.picked, "sent": self.sent, "failed": self.failed}


class OutboxProcessor:
    def __init__(self, uow: UnitOfWork, senders: SenderRegistry) -> None:
        self._uow = uow
        self._senders = senders

    async def run(self) -> OutboxReport:
        now = datetime.now(UTC)
        rows = await self._uow.session.execute(
            select(OutboxMessage)
            .where(
                OutboxMessage.status == "pending",
                OutboxMessage.scheduled_at <= now,
            )
            .order_by(OutboxMessage.scheduled_at.asc())
            .limit(BATCH_SIZE)
            # Если процессов uvicorn несколько, каждый поднимает свой
            # планировщик, и без блокировки двое взяли бы одну задачу —
            # человек получил бы сообщение дважды. SKIP LOCKED отдаёт
            # второму следующие строки, а не ждёт первого.
            # SQLite эту конструкцию не поддерживает, и SQLAlchemy её там
            # просто не выводит: тесты идут в один поток, терять нечего.
            .with_for_update(skip_locked=True)
        )
        batch = list(rows.scalars().all())

        sent = 0
        failed = 0
        for item in batch:
            if await self._deliver(item):
                sent += 1
            else:
                failed += 1

        # Один коммит на пачку: по коммиту на задачу — это двадцать
        # круговых обращений к базе там, где хватает одного.
        await self._uow.commit()
        return OutboxReport(picked=len(batch), sent=sent, failed=failed)

    async def _deliver(self, item: OutboxMessage) -> bool:
        sender = self._senders.get(item.channel)
        if sender is None:
            item.mark_failed(f"Канал «{item.channel}» не подключён")
            return False

        try:
            await sender.send(item.recipient, render(item.template, item.payload))
        except Exception as error:
            # Падение одной задачи не должно останавливать пачку: следующая
            # может быть в другой канал, который вполне жив.
            item.mark_failed(str(error))
            return False

        item.mark_sent()
        return True
