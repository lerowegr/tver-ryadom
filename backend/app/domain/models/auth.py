"""Пользователи и сессии."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, IdMixin, TimestampMixin, UtcDateTime

if TYPE_CHECKING:
    from app.domain.models.bookings import Booking
    from app.domain.models.content import Favorite, Review
    from app.domain.models.notifications import Notification

UserRole = Literal["user", "admin"]


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    #: Может быть пустым: аккаунт, заведённый из бота, живёт без почты.
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    #: Пусто у тех, кто вошёл через Telegram и пароля никогда не заводил.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(String(16), nullable=False, default="user")
    #: Ключ файла в хранилище; кадрирует человек сам, лежит квадрат.
    avatar_key: Mapped[str | None] = mapped_column(String(255))
    email_verified_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    # Один человек — одна запись на все каналы: это и есть синхронизация
    # между сайтом, Telegram, ВКонтакте и MAX.
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    vk_user_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    max_user_id: Mapped[str | None] = mapped_column(String(64), unique=True)

    sessions: Mapped[list[Session]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    bookings: Mapped[list[Booking]] = relationship(back_populates="user")
    reviews: Mapped[list[Review]] = relationship(back_populates="user")
    favorites: Mapped[list[Favorite]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def telegram_linked(self) -> bool:
        return self.telegram_chat_id is not None

    def __repr__(self) -> str:  # pragma: no cover
        return f"User(id={self.id!r}, name={self.name!r}, role={self.role!r})"


class Session(Base, IdMixin):
    """Сессия входа. Хранит хеш refresh-токена, а не сам токен."""

    __tablename__ = "sessions"
    __table_args__ = (Index("sessions_user_idx", "user_id"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(back_populates="sessions")

    def is_active(self, now: datetime | None = None) -> bool:
        moment = now or datetime.now(UTC)
        return self.revoked_at is None and self.expires_at > moment

    def revoke(self, now: datetime | None = None) -> None:
        self.revoked_at = now or datetime.now(UTC)
