"""Бронирование: заявки, отмена, смена статуса.

Самая ответственная часть каталога: здесь занимаются места, проверяется
занятость экскурсовода и меняются статусы. Всё это происходит внутри одной
транзакции единицы работы — на D1 такой возможности не было, и заявка из
двух запросов могла оборваться посередине, оставив занятое место без брони.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import ALLOWED_TRANSITIONS, Booking, BookingStatus
from app.domain.models.tours import Tour
from app.domain.schemas.bookings import (
    BookingCreate,
    BookingCreated,
    BookingListFilter,
    BookingOut,
    TourRef,
)
from app.services.availability import AvailabilityService, to_msk_wall_clock
from app.services.notifications import Notifier

#: Откуда пришла заявка.
BookingSource = str


def format_price(kopecks: int) -> str:
    """«450000» → «4 500 ₽». Неразрывный пробел, как в прежних шаблонах."""
    rubles = kopecks // 100
    return f"{rubles:,}".replace(",", " ") + " ₽"


def format_msk(moment: datetime) -> str:
    """Дата для письма и сообщения — московская, как её увидит гость."""
    wall = to_msk_wall_clock(moment)
    day, month, year = wall.date.split("-")[::-1]
    return f"{day}.{month}.{year}, {wall.time}"


class BookingService:
    def __init__(
        self,
        uow: UnitOfWork,
        availability: AvailabilityService,
        notifier: Notifier,
        *,
        site_url: str | None = None,
    ) -> None:
        self._uow = uow
        self._availability = availability
        self._notifier = notifier
        self._site_url = site_url

    # ---- Создание --------------------------------------------------------

    async def create(
        self,
        data: BookingCreate,
        *,
        user_id: str | None = None,
        source: BookingSource = "web",
    ) -> BookingCreated:
        tour = await self._uow.tours.find_one(
            Tour.id == data.tour_id, Tour.status == "published"
        )
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")

        self._check_group_size(tour, data.people_count)
        starts_at = await self._resolve_date(tour, data, source)

        booking = Booking(
            user_id=user_id,
            tour_id=tour.id,
            schedule_id=data.schedule_id,
            # Слот и своя дата взаимоисключающи: хранить обе значило бы
            # завести второй источник правды о времени экскурсии.
            desired_date=None if data.schedule_id else data.desired_date,
            people_count=data.people_count,
            total_price=tour.price_for(data.people_count),
            contact_name=data.contact_name,
            contact_phone=data.contact_phone,
            contact_email=data.contact_email,
            comment=data.comment,
            source=source,
        )
        self._uow.bookings.add(booking)
        await self._uow.flush()

        await self._announce(booking, tour, starts_at, user_id)

        return BookingCreated(
            id=booking.id,
            status=booking.status,
            total_price=booking.total_price,
            starts_at=starts_at,
            tour=TourRef(id=tour.id, slug=tour.slug, title=tour.title),
        )

    def _check_group_size(self, tour: Tour, people: int) -> None:
        if people < tour.group_min:
            raise ValidationError(f"Минимальный размер группы — {tour.group_min}")
        if tour.group_max is not None and people > tour.group_max:
            raise ValidationError(f"Максимальный размер группы — {tour.group_max}")

    async def _resolve_date(
        self, tour: Tour, data: BookingCreate, source: BookingSource
    ) -> datetime | None:
        now = datetime.now(UTC)

        if data.schedule_id:
            slot = await self._uow.schedules.get(data.schedule_id)
            if slot is None or slot.tour_id != tour.id or not slot.is_open:
                raise NotFoundError("Слот расписания не найден или закрыт")
            if slot.starts_at <= now:
                raise ValidationError("Эта дата уже прошла")
            if not await self._uow.bookings.reserve_seats(slot.id, data.people_count):
                raise ConflictError("На выбранную дату недостаточно свободных мест")
            return slot.starts_at

        if data.desired_date:
            if data.desired_date <= now:
                raise ValidationError("Желаемая дата уже прошла")
            # Своя дата не проходит через расписание, поэтому занятость
            # проверяем здесь: закрытые дни иначе принимали бы заявки молча.
            # Заявку, заведённую админом вручную, не трогаем — там виднее.
            if source != "admin" and await self._availability.is_blocked(
                data.desired_date, tour.duration_minutes
            ):
                raise ConflictError(
                    "В это время экскурсовод занят. Выберите, пожалуйста, другое время."
                )
            return data.desired_date

        return None

    async def _announce(
        self, booking: Booking, tour: Tour, starts_at: datetime | None, user_id: str | None
    ) -> None:
        payload: dict[str, Any] = {
            "bookingId": booking.id,
            "tourTitle": tour.title,
            "startsAt": format_msk(starts_at) if starts_at else None,
            "peopleCount": booking.people_count,
            "totalPriceLabel": format_price(booking.total_price),
            "contactName": booking.contact_name,
            "contactPhone": booking.contact_phone,
            "comment": booking.comment,
            "siteUrl": self._site_url,
        }
        if user_id:
            await self._notifier.notify_user(user_id, "booking_created", payload)
        await self._notifier.notify_admins("admin_new_booking", payload)

    # ---- Чтение ----------------------------------------------------------

    async def list_mine(
        self, user_id: str, filter_: BookingListFilter
    ) -> tuple[list[BookingOut], int]:
        bookings, total = await self._uow.bookings.for_user(user_id, filter_)
        return [self._to_out(booking) for booking in bookings], total

    # ---- Отмена ----------------------------------------------------------

    async def cancel_own(self, user_id: str, booking_id: str, reason: str | None) -> None:
        booking = await self._uow.bookings.with_relations(booking_id)
        # Чужую бронь не отменяем и не подтверждаем её существование:
        # перебором идентификаторов иначе можно было бы узнать чужие заявки.
        if booking is None or booking.user_id != user_id:
            raise NotFoundError("Бронирование не найдено")
        if not booking.is_active:
            raise ConflictError("Это бронирование уже нельзя отменить")
        if booking.schedule and booking.schedule.starts_at <= datetime.now(UTC):
            raise ConflictError("Экскурсия уже началась — отмена через сайт недоступна")

        booking.status = "cancelled"
        booking.cancel_reason = reason
        if booking.schedule_id:
            await self._uow.bookings.release_seats(booking.schedule_id, booking.people_count)

        await self._notifier.notify_user(user_id, "booking_cancelled", {"bookingId": booking.id})
        await self._notifier.notify_admins(
            "admin_booking_cancelled",
            {
                "bookingId": booking.id,
                "tourTitle": booking.tour.title if booking.tour else None,
                "startsAt": format_msk(booking.starts_at) if booking.starts_at else None,
                "peopleCount": booking.people_count,
                "totalPriceLabel": format_price(booking.total_price),
                "contactName": booking.contact_name,
                "contactPhone": booking.contact_phone,
                "comment": reason,
            },
        )

    # ---- Смена статуса ---------------------------------------------------

    async def change_status(
        self, booking_id: str, status: BookingStatus, admin_comment: str | None = None
    ) -> Booking:
        """Перевод брони администратором.

        Отдельный метод, потому что то же самое делает бот: две копии
        правил перехода, возврата мест и уведомлений рассинхронизировались
        бы при первой же правке.
        """
        booking = await self._uow.bookings.with_relations(booking_id)
        if booking is None:
            raise NotFoundError("Бронирование не найдено")

        if booking.status == status:
            # Повтор того же статуса — не ошибка: админка могла нажать
            # дважды. Но комментарий при этом всё равно сохраняем.
            if admin_comment is not None:
                booking.admin_comment = admin_comment
            return booking

        if status not in ALLOWED_TRANSITIONS[booking.status]:
            raise ConflictError(
                f"Нельзя перевести бронь из «{booking.status}» в «{status}»"
            )

        booking.status = status
        if admin_comment is not None:
            booking.admin_comment = admin_comment

        # Отмена возвращает места в слот.
        if status == "cancelled" and booking.schedule_id:
            await self._uow.bookings.release_seats(booking.schedule_id, booking.people_count)

        if booking.user_id:
            await self._notifier.notify_user(
                booking.user_id,
                f"booking_{status}",
                {
                    "bookingId": booking.id,
                    "tourTitle": booking.tour.title if booking.tour else None,
                    "startsAt": format_msk(booking.starts_at) if booking.starts_at else None,
                    "peopleCount": booking.people_count,
                    "totalPriceLabel": format_price(booking.total_price),
                    "comment": admin_comment,
                    "siteUrl": self._site_url,
                },
            )
        return booking

    # ---- Сборка ----------------------------------------------------------

    @staticmethod
    def _to_out(booking: Booking) -> BookingOut:
        tour = booking.tour
        return BookingOut(
            id=booking.id,
            status=booking.status,
            payment_status=booking.payment_status,
            people_count=booking.people_count,
            total_price=booking.total_price,
            starts_at=booking.starts_at,
            contact_name=booking.contact_name,
            contact_phone=booking.contact_phone,
            contact_email=booking.contact_email,
            comment=booking.comment,
            cancel_reason=booking.cancel_reason,
            created_at=booking.created_at,
            tour=TourRef(id=tour.id, slug=tour.slug, title=tour.title) if tour else None,
        )
