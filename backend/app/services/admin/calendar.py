"""Календарь занятости и сводка для панели."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import Booking
from app.domain.models.content import ContactRequest, Review
from app.domain.models.notifications import OutboxMessage
from app.domain.models.tours import Schedule, Tour
from app.domain.schemas.admin import (
    CalendarEntry,
    CalendarGuest,
    DashboardStats,
    DayCount,
    RecentBooking,
    TourRef,
)
from app.services.availability import MSK

#: Больше года за раз не отдаём: это уже не календарь, а выгрузка.
MAX_DAYS = 400


class AdminCalendarService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def load_range(self, start: datetime, end: datetime) -> list[CalendarEntry]:
        """Занятость за период.

        События дают две сущности: слоты расписания и заявки на свою дату.
        Брони, привязанные к слоту, отдельными событиями не идут — иначе в
        календаре двоилось бы; они перечислены внутри слота.
        """
        slots = await self._uow.session.execute(
            select(Schedule, Tour)
            .join(Tour, Tour.id == Schedule.tour_id)
            .where(Schedule.starts_at >= start, Schedule.starts_at <= end)
            .order_by(Schedule.starts_at.asc())
        )
        slot_rows = slots.all()
        slot_ids = [slot.id for slot, _ in slot_rows]

        in_period = (Booking.desired_date >= start) & (Booking.desired_date <= end)
        condition = (
            or_(in_period, Booking.schedule_id.in_(slot_ids)) if slot_ids else in_period
        )
        bookings = await self._uow.session.execute(
            select(Booking)
            .where(Booking.status != "cancelled", condition)
            .options(selectinload(Booking.tour))
        )
        booking_rows = list(bookings.scalars().unique().all())

        guests: dict[str, list[CalendarGuest]] = {}
        for booking in booking_rows:
            if not booking.schedule_id:
                continue
            guests.setdefault(booking.schedule_id, []).append(
                CalendarGuest(
                    name=booking.contact_name,
                    phone=booking.contact_phone,
                    people=booking.people_count,
                    status=booking.status,
                )
            )

        entries: list[CalendarEntry] = [
            CalendarEntry(
                id=slot.id,
                kind="slot",
                tour_id=tour.id,
                tour_title=tour.title,
                starts_at=slot.starts_at,
                duration_minutes=tour.duration_minutes,
                status=slot.status,
                meeting_point=tour.meeting_point,
                capacity=slot.capacity,
                booked=slot.booked_count,
                guests=guests.get(slot.id, []),
            )
            for slot, tour in slot_rows
        ]

        entries.extend(
            CalendarEntry(
                id=booking.id,
                kind="request",
                tour_id=booking.tour_id,
                tour_title=booking.tour.title if booking.tour else "",
                starts_at=booking.desired_date,  # type: ignore[arg-type]
                duration_minutes=booking.tour.duration_minutes if booking.tour else 0,
                status=booking.status,
                meeting_point=booking.tour.meeting_point if booking.tour else None,
                people=booking.people_count,
                contact_name=booking.contact_name,
                contact_phone=booking.contact_phone,
            )
            for booking in booking_rows
            if booking.schedule_id is None and booking.desired_date is not None
        )

        entries.sort(key=lambda entry: entry.starts_at)
        return entries


class DashboardService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def stats(self) -> DashboardStats:
        session = self._uow.session
        now = datetime.now(UTC)
        # Сутки считаются по Твери, а не по UTC: иначе «сегодня» у Елены
        # начиналось бы в три часа ночи.
        day_start = now.astimezone(MSK).replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)

        bookings_today = await self._count(Booking, Booking.created_at >= day_start)
        pending = await self._count(Booking, Booking.status == "pending")

        future_slots = select(Schedule.id).where(Schedule.starts_at > now)
        upcoming = await self._count(Booking, Booking.schedule_id.in_(future_slots))

        revenue = await session.scalar(
            select(func.coalesce(func.sum(Booking.total_price), 0)).where(
                Booking.status.in_(("confirmed", "completed"))
            )
        )
        pending_reviews = await self._count(Review, Review.status == "pending")
        new_requests = await self._count(ContactRequest, ContactRequest.status == "new")
        # Упавшие доставки — бейдж в меню: иначе мёртвые задачи копятся молча.
        failed = await self._count(OutboxMessage, OutboxMessage.status == "failed")

        # Группировка по дням делается в Python, а не в SQL: выражение для
        # даты у SQLite и PostgreSQL разное, а записей за неделю немного.
        week = await session.execute(
            select(Booking.created_at).where(Booking.created_at >= week_ago)
        )
        by_day: dict[str, int] = {}
        for (created_at,) in week.all():
            key = created_at.astimezone(MSK).strftime("%Y-%m-%d")
            by_day[key] = by_day.get(key, 0) + 1

        recent = await session.execute(
            select(Booking)
            .order_by(Booking.created_at.desc())
            .limit(6)
            .options(selectinload(Booking.tour), selectinload(Booking.schedule))
        )

        return DashboardStats(
            bookings_today=bookings_today,
            pending_bookings=pending,
            upcoming_bookings=upcoming,
            revenue=int(revenue or 0),
            pending_reviews=pending_reviews,
            new_requests=new_requests,
            failed_notifications=failed,
            bookings_by_day=[
                DayCount(day=day, total=total) for day, total in sorted(by_day.items())
            ],
            recent_bookings=[
                RecentBooking(
                    id=booking.id,
                    status=booking.status,
                    contact_name=booking.contact_name,
                    people_count=booking.people_count,
                    total_price=booking.total_price,
                    created_at=booking.created_at,
                    starts_at=booking.starts_at,
                    tour=(
                        TourRef(
                            id=booking.tour.id,
                            slug=booking.tour.slug,
                            title=booking.tour.title,
                        )
                        if booking.tour
                        else None
                    ),
                )
                for booking in recent.scalars().unique().all()
            ],
        )

    async def _count(self, model: type, *conditions: object) -> int:
        total = await self._uow.session.scalar(
            select(func.count()).select_from(model).where(*conditions)  # type: ignore[arg-type]
        )
        return int(total or 0)
