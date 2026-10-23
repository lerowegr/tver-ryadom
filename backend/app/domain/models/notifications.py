"""Уведомления в кабинете и очередь доставки во внешние каналы."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, IdMixin, UtcDateTime

if TYPE_CHECKING:
    from app.domain.models.auth import User

NotificationChannel = Literal["telegram", "email", "vk", "max", "sms", "push"]
OutboxStatus = Literal["pending", "sent", "failed"]


class Notification(Base, IdMixin):
    """Запись в личном кабинете: её человек видит на сайте."""

    __tablename__ = "notifications"
    __table_args__ = (Index("notifications_user_read_idx", "user_id", "read_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    read_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(back_populates="notifications")

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def mark_read(self) -> None:
        if self.read_at is None:
            self.read_at = datetime.now(UTC)


class OutboxMessage(Base, IdMixin):
    """Задача на отправку во внешний канал.

    На Workers это заменяло Redis с очередью: писать в таблицу и разгребать
    по расписанию дешевле, чем держать брокер. На своём сервере брокер уже
    возможен, но очередь в базе переживает перезапуск и видна глазами —
    поэтому остаётся как есть.
    """

    __tablename__ = "outbox"
    __table_args__ = (Index("outbox_status_scheduled_idx", "status", "scheduled_at"),)

    channel: Mapped[NotificationChannel] = mapped_column(String(16), nullable=False)
    #: chat_id для Telegram, адрес для почты и так далее.
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    template: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    status: Mapped[OutboxStatus] = mapped_column(String(16), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    #: После стольких неудач задача считается безнадёжной.
    MAX_ATTEMPTS = 5

    def mark_sent(self) -> None:
        self.status = "sent"
        self.sent_at = datetime.now(UTC)
        self.last_error = None

    def mark_failed(self, error: str, retry_in_seconds: int = 60) -> None:
        """Откладывает повтор, а после исчерпания попыток закрывает задачу.

        Без потолка попыток одно недоставляемое сообщение крутилось бы
        в очереди вечно и съедало каждый тик планировщика.
        """
        from datetime import timedelta

        self.attempts += 1
        self.last_error = error[:1000]
        if self.attempts >= self.MAX_ATTEMPTS:
            self.status = "failed"
        else:
            self.scheduled_at = datetime.now(UTC) + timedelta(
                seconds=retry_in_seconds * self.attempts
            )
