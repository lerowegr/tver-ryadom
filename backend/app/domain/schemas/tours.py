"""Схемы каталога экскурсий.

Имена полей наружу — те же, что отдавал прежний API: сайт, админка и боты
читают `shortDescription`, `freeSeats`, `ratingAvg`. Переименовать их
означало бы переписать заодно и фронтенд.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field

from app.domain.schemas.common import CamelSchema, Pagination, Schema


class TourSort(StrEnum):
    POPULAR = "popular"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    DURATION_ASC = "duration_asc"
    DURATION_DESC = "duration_desc"
    RATING_ASC = "rating_asc"
    RATING_DESC = "rating_desc"


class TourFilter(Pagination):
    """Отбор в каталоге. Приходит строкой запроса, поэтому всё необязательно."""

    badge: str | None = None
    price_min: int | None = Field(default=None, ge=0, alias="priceMin")
    price_max: int | None = Field(default=None, ge=0, alias="priceMax")
    duration_max: int | None = Field(default=None, gt=0, alias="durationMax")
    search: str | None = Field(default=None, max_length=200)
    sort: TourSort = TourSort.POPULAR

    @property
    def badge_slugs(self) -> list[str]:
        """Несколько бейджей через запятую: подходит совпадение хотя бы по одному."""
        if not self.badge:
            return []
        return [slug.strip() for slug in self.badge.split(",") if slug.strip()]


class ImageOut(CamelSchema):
    r2_key: str
    alt: str | None
    #: Готовые размеры абсолютными адресами: thumb, card, hero, original.
    variants: dict[str, str]


class BadgeOut(Schema):
    slug: str
    label: str


class RoutePointOut(Schema):
    title: str
    description: str | None
    lat: float
    lng: float


class ScheduleOut(CamelSchema):
    id: str
    starts_at: datetime
    capacity: int
    free_seats: int


class ProgramStep(CamelSchema):
    title: str
    description: str | None = None
    duration_minutes: int | None = None


class TourBase(CamelSchema):
    """Общее у карточки и страницы.

    Разделено именно так, потому что `image` и `routePoints` у них разные:
    карточке нужна одна фотография и названия точек, странице — вся галерея
    и координаты. Наследование страницы от карточки тащило бы в ответ
    лишнее поле.
    """

    id: str
    slug: str
    title: str
    subtitle: str | None
    short_description: str
    price: int
    price_type: Literal["per_person", "per_group"]
    duration_minutes: int
    group_min: int
    group_max: int | None
    rating_avg: float
    rating_count: int
    badges: list[BadgeOut]


class TourCard(TourBase):
    """Карточка для каталога, избранного и подборок."""

    image: ImageOut | None
    #: Только названия: карточке хватает их, а координаты лишний вес.
    route_points: list[str]


class TourDetail(TourBase):
    full_description: str
    program: list[ProgramStep]
    meeting_point: str | None
    meeting_lat: float | None
    meeting_lng: float | None
    included: list[str]
    not_included: list[str]
    recommendations: str | None
    images: list[ImageOut]
    route_points: list[RoutePointOut]
    schedules: list[ScheduleOut]


class ReviewOut(CamelSchema):
    id: str
    author_name: str
    rating: int
    text: str
    created_at: datetime


class ScheduleEntry(CamelSchema):
    """Сборный выход вместе с экскурсией — для раздела «Расписание»."""

    id: str
    starts_at: datetime
    capacity: int
    free_seats: int
    tour: TourCard
