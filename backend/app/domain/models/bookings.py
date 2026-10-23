"""Брони и платежи."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, IdMixin, TimestampMixin

if TYPE_CHECKING:
    from app.domain.models.auth import User
    from app.domain.models.tours import Schedule, Tour

BookingStatus = Literal["pending", "confirmed", "cancelled", "completed"]
PaymentStatus = Literal["none", "pending", "paid", "refunded"]
BookingSource = Literal["web", "telegram", "vk", "max", "admin"]

#: Из какого состояния куда можно перевести бронь. Правила живут здесь,
#: а не в обработчике запроса: тот же переход делает бот и админка.
ALLOWED_TRANSITIONS: dict[BookingStatus, frozenset[BookingStatus]] = {
    "pending": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"completed", "cancelled"}),
    "cancelled": frozenset(),
    "completed": frozenset(),
}


class Booking(Base, IdMixin, TimestampMixin):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("bookings_user_status_idx", "user_id", "status"),
        Index("bookings_tour_status_idx", "tour_id", "status"),
        Index("bookings_schedule_idx", "schedule_id"),
    )

    #: Пусто у гостевых заявок — бронировать можно без аккаунта.
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL")
    )
    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="RESTRICT"), nullable=False
    )
    #: Либо слот расписания…
    schedule_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("schedules.id", ondelete="SET NULL")
    )
    #: …либо своя дата, если подходящего слота нет.
    desired_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    people_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Копейки, зафиксированные на момент брони: цена экскурсии могла меняться.
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[BookingStatus] = mapped_column(String(16), nullable=False, default="pending")
    payment_status: Mapped[PaymentStatus] = mapped_column(
        String(16), nullable=False, default="none"
    )

    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255))
    comment: Mapped[str | None] = mapped_column(Text)
    admin_comment: Mapped[str | None] = mapped_column(Text)
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    source: Mapped[BookingSource] = mapped_column(String(16), nullable=False, default="web")
    #: Когда ушло напоминание за сутки — защита от повторов в фоновой задаче.
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Человек выключил напоминание именно об этой экскурсии.
    reminder_off: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped[User | None] = relationship(back_populates="bookings")
    tour: Mapped[Tour] = relationship(back_populates="bookings")
    schedule: Mapped[Schedule | None] = relationship(back_populates="bookings")
    payments: Mapped[list[Payment]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )

    @property
    def starts_at(self) -> datetime | None:
        """Когда экскурсия: из слота, иначе из желаемой даты."""
        return self.schedule.starts_at if self.schedule else self.desired_date

    @property
    def is_active(self) -> bool:
        return self.status in ("pending", "confirmed")

    def can_transition_to(self, status: BookingStatus) -> bool:
        return status in ALLOWED_TRANSITIONS[self.status]

    def __repr__(self) -> str:  # pragma: no cover
        return f"Booking(id={self.id!r}, status={self.status!r}, people={self.people_count})"


class Payment(Base, IdMixin, TimestampMixin):
    """Задел под онлайн-оплату: таблица есть, провайдер подключается позже."""

    __tablename__ = "payments"
    __table_args__ = (Index("payments_booking_idx", "booking_id"),)

    booking_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    booking: Mapped[Booking] = relationship(back_populates="payments")
