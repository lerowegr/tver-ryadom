"""Напоминания за сутки до экскурсии."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import Booking
from app.domain.models.tours import Schedule
from app.services.bookings import format_price
from app.services.notifications.notifier import Notifier
from app.services.notifications.templates import format_msk

#: За один проход — не больше: остальные уедут следующим тиком, а пауза
#: между ними всё равно минута.
BATCH_SIZE = 50


@dataclass(frozen=True, slots=True)
class ReminderReport:
    reminders: int

    def as_dict(self) -> dict[str, int]:
        return {"reminders": self.reminders}


class ReminderService:
    def __init__(
        self, uow: UnitOfWork, notifier: Notifier, *, site_url: str | None = None
    ) -> None:
        self._uow = uow
        self._notifier = notifier
        self._site_url = site_url

    async def run(self) -> ReminderReport:
        """Подтверждённые брони со слотом в ближайшие сутки.

        Отметка об отправке ставится до уведомления, а не после: иначе
        сбой на отправке повторил бы напоминание на следующем тике, и
        человек получил бы его дважды. Уведомление и так уйдёт через
        очередь, у которой свои повторы.
        """
        now = datetime.now(UTC)
        window = now + timedelta(hours=24)

        due_slots = select(Schedule.id).where(
            Schedule.starts_at > now, Schedule.starts_at <= window
        )
        rows = await self._uow.session.execute(
            select(Booking)
            .where(
                Booking.status == "confirmed",
                Booking.reminder_sent_at.is_(None),
                # Человек мог выключить напоминание по этой брони в боте.
                Booking.reminder_off.is_(False),
                Booking.schedule_id.in_(due_slots),
            )
            .limit(BATCH_SIZE)
            .options(selectinload(Booking.tour), selectinload(Booking.schedule))
        )
        due = list(rows.scalars().unique().all())

        for booking in due:
            booking.reminder_sent_at = now
            if not booking.user_id:
                # Гостевая бронь: писать некуда, но отметку ставим, чтобы
                # не перебирать её на каждом тике.
                continue
            await self._notifier.notify_user(
                booking.user_id,
                "booking_reminder",
                {
                    "bookingId": booking.id,
                    "tourTitle": booking.tour.title if booking.tour else None,
                    "startsAt": (
                        format_msk(booking.starts_at) if booking.starts_at else None
                    ),
                    "peopleCount": booking.people_count,
                    "totalPriceLabel": format_price(booking.total_price),
                    "siteUrl": self._site_url,
                },
            )

        await self._uow.commit()
        return ReminderReport(reminders=len(due))
