"""Отзывы, избранное, галерея, обращения и настройки сайта."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, IdMixin, UtcDateTime

if TYPE_CHECKING:
    from app.domain.models.auth import User
    from app.domain.models.tours import Tour

ReviewStatus = Literal["pending", "approved", "rejected"]
ContactRequestStatus = Literal["new", "processed"]


class Review(Base, IdMixin):
    __tablename__ = "reviews"
    __table_args__ = (Index("reviews_tour_status_idx", "tour_id", "status"),)

    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), nullable=False
    )
    #: Пусто у отзывов, перенесённых с Авито и Спутника: там авторов
    #: у нас нет, есть только имя.
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL")
    )
    author_name: Mapped[str] = mapped_column(String(100), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ReviewStatus] = mapped_column(String(16), nullable=False, default="pending")
    #: Дата отзыва на площадке, откуда он перенесён, а не дата импорта:
    #: иначе прошлогодний отзыв выглядел бы свежим.
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    tour: Mapped[Tour] = relationship(back_populates="reviews")
    user: Mapped[User | None] = relationship(back_populates="reviews")

    @property
    def is_approved(self) -> bool:
        return self.status == "approved"


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(back_populates="favorites")
    tour: Mapped[Tour] = relationship()


class GalleryImage(Base, IdMixin):
    __tablename__ = "gallery_images"

    r2_key: Mapped[str] = mapped_column(String(255), nullable=False)
    alt: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    variants: Mapped[dict[str, str] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )


class ContactRequest(Base, IdMixin):
    """Сообщение из формы обратной связи."""

    __tablename__ = "contact_requests"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ContactRequestStatus] = mapped_column(
        String(16), nullable=False, default="new"
    )
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=lambda: datetime.now(UTC)
    )


class Setting(Base):
    """Настройки сайта: контакты, тексты разделов, служебные значения.

    Без общей примеси со временем: даты создания у настройки не бывает,
    она либо есть, либо нет.
    """

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    #: Значение хранится как JSON — так в одном поле живут и строки, и списки.
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
