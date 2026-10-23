"""Каталог экскурсий: витрина, страница маршрута, расписание, отзывы."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.errors import NotFoundError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.tours import Schedule, Tour
from app.domain.schemas.tours import (
    BadgeOut,
    ProgramStep,
    ReviewOut,
    RoutePointOut,
    ScheduleEntry,
    ScheduleOut,
    TourCard,
    TourDetail,
    TourFilter,
)
from app.services.images import ImageUrlBuilder


class TourCatalogService:
    """Читающая часть каталога: ничего не меняет, только собирает ответы."""

    def __init__(self, uow: UnitOfWork, images: ImageUrlBuilder) -> None:
        self._uow = uow
        self._images = images

    # ---- Витрина ---------------------------------------------------------

    async def list_tours(self, filter_: TourFilter) -> tuple[list[TourCard], int]:
        tours, total = await self._uow.tours.search(filter_)
        return [self.to_card(tour) for tour in tours], total

    async def get_tour(self, slug: str) -> TourDetail:
        tour = await self._uow.tours.published_by_slug(slug)
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")
        return self._to_detail(tour)

    async def list_badges(self) -> list[BadgeOut]:
        badges = await self._uow.badges.all_sorted()
        return [BadgeOut.model_validate(badge) for badge in badges]

    # ---- Расписание ------------------------------------------------------

    async def list_schedule(self, limit: int = 60) -> list[ScheduleEntry]:
        slots = await self._uow.schedules.upcoming_everywhere(limit)
        return [
            ScheduleEntry(
                id=slot.id,
                starts_at=slot.starts_at,
                capacity=slot.capacity,
                free_seats=slot.free_seats,
                tour=self.to_card(slot.tour),
            )
            for slot in slots
        ]

    # ---- Отзывы ----------------------------------------------------------

    async def list_reviews(
        self, slug: str, *, limit: int, offset: int
    ) -> tuple[list[ReviewOut], int]:
        tour = await self._uow.tours.find_one(Tour.slug == slug, Tour.status == "published")
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")
        reviews, total = await self._uow.reviews.approved_for_tour(
            tour.id, limit=limit, offset=offset
        )
        return [ReviewOut.model_validate(review) for review in reviews], total

    # ---- Сборка ----------------------------------------------------------

    @staticmethod
    def _to_base(tour: Tour) -> dict:
        return {
            "id": tour.id,
            "slug": tour.slug,
            "title": tour.title,
            "subtitle": tour.subtitle,
            "short_description": tour.short_description,
            "price": tour.price,
            "price_type": tour.price_type,
            "duration_minutes": tour.duration_minutes,
            "group_min": tour.group_min,
            "group_max": tour.group_max,
            "rating_avg": tour.rating_avg,
            "rating_count": tour.rating_count,
            "badges": [BadgeOut.model_validate(badge) for badge in tour.badges],
        }

    def to_card(self, tour: Tour) -> TourCard:
        """Карточка экскурсии. Публичная: её же собирает избранное."""
        return TourCard(
            **self._to_base(tour),
            image=self._images.first(sorted(tour.images, key=lambda i: i.sort_order)),
            route_points=[point.title for point in self._ordered_points(tour)],
        )

    def _to_detail(self, tour: Tour) -> TourDetail:
        return TourDetail(
            **self._to_base(tour),
            full_description=tour.full_description,
            program=[ProgramStep.model_validate(step) for step in tour.program],
            meeting_point=tour.meeting_point,
            meeting_lat=tour.meeting_lat,
            meeting_lng=tour.meeting_lng,
            included=tour.included,
            not_included=tour.not_included,
            recommendations=tour.recommendations,
            images=[
                self._images.build(image)
                for image in sorted(tour.images, key=lambda i: i.sort_order)
            ],
            route_points=[
                RoutePointOut(
                    title=point.title,
                    description=point.description,
                    lat=point.lat,
                    lng=point.lng,
                )
                for point in self._ordered_points(tour)
            ],
            schedules=[self._to_slot(slot) for slot in self._open_slots(tour)],
        )

    @staticmethod
    def _ordered_points(tour: Tour) -> list:
        return sorted(tour.route_points, key=lambda point: point.sort_order)

    @staticmethod
    def _open_slots(tour: Tour) -> list[Schedule]:
        """Только то, на что ещё можно записаться: прошедшие и закрытые
        слоты в форме бронирования выглядели бы предложением."""
        now = datetime.now(UTC)
        return sorted(
            (slot for slot in tour.schedules if slot.is_open and slot.starts_at > now),
            key=lambda slot: slot.starts_at,
        )

    @staticmethod
    def _to_slot(slot: Schedule) -> ScheduleOut:
        return ScheduleOut(
            id=slot.id,
            starts_at=slot.starts_at,
            capacity=slot.capacity,
            free_seats=slot.free_seats,
        )
