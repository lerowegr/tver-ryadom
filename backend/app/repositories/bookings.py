"""Репозиторий броней и работа со счётчиком мест."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import ColumnElement, CursorResult, case, func, or_, select, update
from sqlalchemy.orm import selectinload

from app.domain.models.bookings import Booking
from app.domain.models.tours import Schedule
from app.domain.schemas.bookings import BookingListFilter
from app.repositories.base import Repository


class BookingRepository(Repository[Booking]):
    model = Booking

    async def with_relations(self, booking_id: str) -> Booking | None:
        query = (
            select(Booking)
            .where(Booking.id == booking_id)
            .options(selectinload(Booking.tour), selectinload(Booking.schedule))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def for_user(
        self, user_id: str, filter_: BookingListFilter
    ) -> tuple[list[Booking], int]:
        conditions: list[ColumnElement[bool]] = [Booking.user_id == user_id]
        if filter_.status:
            conditions.append(Booking.status == filter_.status)
        if filter_.tour_id:
            conditions.append(Booking.tour_id == filter_.tour_id)

        if filter_.upcoming is not None:
            now = datetime.now(UTC)
            future_slots = select(Schedule.id).where(Schedule.starts_at > now)
            is_upcoming = or_(
                Booking.desired_date > now,
                Booking.schedule_id.in_(future_slots),
            )
            conditions.append(is_upcoming if filter_.upcoming else ~is_upcoming)

        total = await self.session.scalar(
            select(func.count()).select_from(Booking).where(*conditions)
        )
        rows = await self.session.execute(
            select(Booking)
            .where(*conditions)
            .order_by(Booking.created_at.desc())
            .limit(filter_.limit)
            .offset(filter_.offset)
            .options(selectinload(Booking.tour), selectinload(Booking.schedule))
        )
        return list(rows.scalars().unique().all()), int(total or 0)

    # ---- Места в слоте ---------------------------------------------------

    async def reserve_seats(self, schedule_id: str, people: int) -> bool:
        """Занимает места условным UPDATE.

        Проверка вместимости — в самом WHERE, а не отдельным запросом перед
        ним. Иначе две одновременные заявки обе увидели бы свободные места
        и обе записались: между проверкой и записью успевает вклиниться
        чужая транзакция.

        Возвращает False, если мест не хватило или слот закрыт.
        """
        result = cast(
            CursorResult[Any],
            await self.session.execute(
            update(Schedule)
            .where(
                Schedule.id == schedule_id,
                Schedule.status == "open",
                Schedule.booked_count + people <= Schedule.capacity,
            )
            .values(booked_count=Schedule.booked_count + people)
            # Объект слота в сессии мог устареть; синхронизировать его
            # незачем, дальше он перечитывается при необходимости.
            .execution_options(synchronize_session=False),
            ),
        )
        return (result.rowcount or 0) > 0

    async def release_seats(self, schedule_id: str, people: int) -> None:
        """Возвращает места при отмене.

        Нижняя граница в ноль — страховка от рассинхронизации счётчика:
        отрицательное число мест выглядело бы как «свободно больше, чем
        вмещается».

        Через CASE, а не через max(): в SQLite max двухаргументный, а в
        PostgreSQL это агрегат, и такой запрос там просто не выполнится.
        """
        remaining = Schedule.booked_count - people
        await self.session.execute(
            update(Schedule)
            .where(Schedule.id == schedule_id)
            .values(booked_count=case((remaining < 0, 0), else_=remaining))
            .execution_options(synchronize_session=False)
        )
