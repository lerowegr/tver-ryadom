"""Фоновые задачи.

На Workers это делал Cron Trigger: платформа будила воркер раз в минуту.
Своего планировщика там быть не могло — процесс не живёт между запросами.
Здесь процесс живёт, и задачи крутятся внутри него.

Тик делает две вещи: ставит напоминания за сутки и разбирает очередь
доставки. Обе работы короткие; если одна упала, вторая всё равно
выполнится, а ошибка попадёт в журнал.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import Settings
from app.core.database import Database
from app.core.unit_of_work import UnitOfWork
from app.integrations.senders import EmailSender, SenderRegistry, TelegramSender
from app.services.notifications.notifier import OutboxNotifier
from app.services.notifications.outbox import OutboxProcessor
from app.services.notifications.reminders import ReminderService

logger = logging.getLogger("tver.scheduler")

#: Как часто просыпаемся. Раз в минуту — как было на Cloudflare.
TICK_SECONDS = 60


class BackgroundJobs:
    def __init__(self, database: Database, settings: Settings) -> None:
        self._database = database
        self._settings = settings
        self._scheduler = AsyncIOScheduler(timezone="UTC")

    def start(self) -> None:
        self._scheduler.add_job(
            self.tick,
            IntervalTrigger(seconds=TICK_SECONDS),
            id="notifications",
            # Если тик затянулся, следующий не накладывается, а пропускается:
            # две копии разбирали бы одну и ту же очередь.
            max_instances=1,
            coalesce=True,
        )
        self._scheduler.start()
        logger.info("Планировщик запущен, тик раз в %s с", TICK_SECONDS)

    async def stop(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def senders(self) -> SenderRegistry:
        return SenderRegistry(
            TelegramSender(self._settings.telegram_bot_token),
            EmailSender(self._settings.resend_api_key, self._settings.email_from),
        )

    async def tick(self) -> dict[str, int]:
        """Один проход. Исключения наружу не выпускаем: упавшая задача не
        должна снимать расписание целиком."""
        result: dict[str, int] = {}
        try:
            async with UnitOfWork(self._database.session_factory) as uow:
                reminders = ReminderService(
                    uow, OutboxNotifier(uow), site_url=self._settings.site_url
                )
                result.update((await reminders.run()).as_dict())
        except Exception:
            logger.exception("Напоминания не отработали")

        try:
            async with UnitOfWork(self._database.session_factory) as uow:
                processor = OutboxProcessor(uow, self.senders())
                result.update((await processor.run()).as_dict())
        except Exception:
            logger.exception("Очередь доставки не отработала")

        if result:
            logger.info("Тик: %s", result)
        return result
