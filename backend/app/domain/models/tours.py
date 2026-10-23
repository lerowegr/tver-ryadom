"""Экскурсии: описание, бейджи, фотографии, маршрут и расписание."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, IdMixin, TimestampMixin

if TYPE_CHECKING:
    from app.domain.models.bookings import Booking
    from app.domain.models.content import Review

TourStatus = Literal["draft", "published", "archived"]
PriceType = Literal["per_person", "per_group"]
ScheduleStatus = Literal["open", "closed", "cancelled"]


class Tour(Base, IdMixin, TimestampMixin):
    __tablename__ = "tours"
    __table_args__ = (Index("tours_status_idx", "status"),)

    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(200))
    short_description: Mapped[str] = mapped_column(Text, nullable=False)
    full_description: Mapped[str] = mapped_column(Text, nullable=False)
    #: Пункты программы. У пешеходных прогулок пусто — Елена просила не
    #: расписывать их заранее.
    program: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    #: Копейки: в рублях с плавающей точкой цена рано или поздно разъезжается.
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    price_type: Mapped[PriceType] = mapped_column(
        String(16), nullable=False, default="per_person"
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    group_min: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    group_max: Mapped[int | None] = mapped_column(Integer)

    meeting_point: Mapped[str | None] = mapped_column(Text)
    meeting_lat: Mapped[float | None] = mapped_column(Float)
    meeting_lng: Mapped[float | None] = mapped_column(Float)

    included: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    not_included: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    recommendations: Mapped[str | None] = mapped_column(Text)

    status: Mapped[TourStatus] = mapped_column(String(16), nullable=False, default="draft")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Денормализованный рейтинг: пересчитывается при модерации отзывов,
    #: чтобы каталог не считал среднее по всем отзывам на каждый запрос.
    rating_avg: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    images: Mapped[list[TourImage]] = relationship(
        back_populates="tour",
        cascade="all, delete-orphan",
        order_by="TourImage.sort_order",
    )
    route_points: Mapped[list[RoutePoint]] = relationship(
        back_populates="tour",
        cascade="all, delete-orphan",
        order_by="RoutePoint.sort_order",
    )
    schedules: Mapped[list[Schedule]] = relationship(
        back_populates="tour",
        cascade="all, delete-orphan",
        order_by="Schedule.starts_at",
    )
    badges: Mapped[list[Badge]] = relationship(secondary="tour_badges", back_populates="tours")
    reviews: Mapped[list[Review]] = relationship(
        back_populates="tour", cascade="all, delete-orphan"
    )
    bookings: Mapped[list[Booking]] = relationship(back_populates="tour")

    @property
    def is_published(self) -> bool:
        return self.status == "published"

    def price_for(self, people: int) -> int:
        """Стоимость заявки. За группу цена не зависит от числа участников."""
        return self.price * people if self.price_type == "per_person" else self.price

    def __repr__(self) -> str:  # pragma: no cover
        return f"Tour(slug={self.slug!r}, status={self.status!r})"


class Badge(Base, IdMixin):
    __tablename__ = "badges"

    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    label: Mapped[str] = mapped_column(String(50), nullable=False)

    tours: Mapped[list[Tour]] = relationship(secondary="tour_badges", back_populates="badges")


class TourBadge(Base):
    """Связка экскурсии и бейджа."""

    __tablename__ = "tour_badges"

    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), primary_key=True
    )
    badge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("badges.id", ondelete="CASCADE"), primary_key=True
    )


class TourImage(Base, IdMixin):
    __tablename__ = "tour_images"
    __table_args__ = (Index("tour_images_tour_idx", "tour_id"),)

    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), nullable=False
    )
    r2_key: Mapped[str] = mapped_column(String(255), nullable=False)
    alt: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Готовые размеры в хранилище: thumb, card, hero, original.
    variants: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    tour: Mapped[Tour] = relationship(back_populates="images")


class RoutePoint(Base, IdMixin):
    __tablename__ = "route_points"
    __table_args__ = (Index("route_points_tour_idx", "tour_id"),)

    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tour: Mapped[Tour] = relationship(back_populates="route_points")


class Schedule(Base, IdMixin):
    """Сборный выход: дата, вместимость и счётчик занятых мест."""

    __tablename__ = "schedules"
    __table_args__ = (Index("schedules_tour_starts_idx", "tour_id", "starts_at"),)

    tour_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tours.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Денормализованный счётчик: он же защищает от овербукинга в условном
    #: UPDATE, когда две заявки приходят одновременно.
    booked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[ScheduleStatus] = mapped_column(String(16), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    tour: Mapped[Tour] = relationship(back_populates="schedules")
    bookings: Mapped[list[Booking]] = relationship(back_populates="schedule")

    @property
    def free_seats(self) -> int:
        return max(0, self.capacity - self.booked_count)

    @property
    def is_open(self) -> bool:
        return self.status == "open"
