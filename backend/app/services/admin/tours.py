"""Управление экскурсиями и расписанием."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import Booking
from app.domain.models.tours import RoutePoint, Schedule, Tour, TourBadge
from app.domain.schemas.admin import (
    AdminImage,
    AdminRoutePoint,
    AdminScheduleOut,
    AdminTourDetail,
    AdminTourListItem,
    ScheduleCreate,
    ScheduleUpdate,
    TourCreate,
    TourFilter,
    TourUpdate,
)
from app.domain.schemas.tours import BadgeOut, ProgramStep
from app.services.images import ImageUrlBuilder

#: Статусы, при которых бронь считается живой.
ACTIVE_BOOKINGS = ("pending", "confirmed")


class AdminTourService:
    def __init__(self, uow: UnitOfWork, images: ImageUrlBuilder) -> None:
        self._uow = uow
        self._images = images

    # ---- Список и карточка ----------------------------------------------

    async def list_tours(self, filter_: TourFilter) -> tuple[list[AdminTourListItem], int]:
        conditions = []
        if filter_.status:
            conditions.append(Tour.status == filter_.status)
        if filter_.search:
            pattern = f"%{filter_.search}%"
            conditions.append(Tour.title.ilike(pattern) | Tour.slug.ilike(pattern))

        total = await self._uow.tours.count(*conditions)
        tours = await self._uow.tours.find_many(
            *conditions,
            order_by=[Tour.sort_order.asc(), Tour.title.asc()],
            limit=filter_.limit,
            offset=filter_.offset,
        )
        return [AdminTourListItem.model_validate(tour) for tour in tours], total

    async def get_tour(self, tour_id: str) -> AdminTourDetail:
        tour = await self._load(tour_id)
        return self._to_detail(tour)

    # ---- Создание и правка ----------------------------------------------

    async def create(self, data: TourCreate) -> AdminTourDetail:
        await self._assert_slug_free(data.slug)

        tour = Tour(
            slug=data.slug,
            title=data.title,
            subtitle=data.subtitle,
            short_description=data.short_description,
            full_description=data.full_description,
            program=[step.model_dump(by_alias=True, exclude_none=True) for step in data.program],
            price=data.price,
            price_type=data.price_type,
            duration_minutes=data.duration_minutes,
            group_min=data.group_min,
            group_max=data.group_max,
            meeting_point=data.meeting_point,
            meeting_lat=data.meeting_lat,
            meeting_lng=data.meeting_lng,
            included=data.included,
            not_included=data.not_included,
            recommendations=data.recommendations,
            status=data.status,
            sort_order=data.sort_order,
        )
        self._uow.tours.add(tour)
        await self._uow.flush()

        await self._replace_badges(tour.id, data.badge_slugs)
        await self._replace_route_points(tour.id, data.route_points)
        await self._uow.flush()
        return self._to_detail(await self._load(tour.id))

    async def update(self, tour_id: str, data: TourUpdate) -> AdminTourDetail:
        tour = await self._load(tour_id)
        patch = data.model_dump(exclude_unset=True, by_alias=False)

        if patch.get("slug"):
            await self._assert_slug_free(patch["slug"], except_id=tour_id)

        for field in (
            "slug", "title", "subtitle", "short_description", "full_description",
            "price", "price_type", "duration_minutes", "group_min", "group_max",
            "meeting_point", "meeting_lat", "meeting_lng", "included", "not_included",
            "recommendations", "status", "sort_order",
        ):
            if field in patch:
                setattr(tour, field, patch[field])

        if data.program is not None:
            tour.program = [
                step.model_dump(by_alias=True, exclude_none=True) for step in data.program
            ]
        if data.badge_slugs is not None:
            await self._replace_badges(tour_id, data.badge_slugs)
        if data.route_points is not None:
            await self._replace_route_points(tour_id, data.route_points)

        await self._uow.flush()
        return self._to_detail(await self._load(tour_id))

    async def archive(self, tour_id: str) -> None:
        """Архивация вместо удаления: история броней должна сохраниться."""
        tour = await self._load(tour_id)
        active = await self._uow.bookings.count(
            Booking.tour_id == tour_id, Booking.status.in_(ACTIVE_BOOKINGS)
        )
        if active > 0:
            raise ConflictError("У экскурсии есть активные брони — сначала обработайте их")
        tour.status = "archived"

    # ---- Вспомогательное -------------------------------------------------

    async def _load(self, tour_id: str) -> Tour:
        tour = await self._uow.tours.by_id_full(tour_id)
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")
        return tour

    async def _assert_slug_free(self, slug: str, *, except_id: str | None = None) -> None:
        conditions = [Tour.slug == slug]
        if except_id:
            conditions.append(Tour.id != except_id)
        if await self._uow.tours.exists(*conditions):
            raise ConflictError("Экскурсия с таким адресом уже есть")

    async def _replace_badges(self, tour_id: str, slugs: list[str]) -> None:
        await self._uow.session.execute(
            TourBadge.__table__.delete().where(TourBadge.tour_id == tour_id)
        )
        if not slugs:
            return
        found = await self._uow.badges.by_slugs(slugs)
        missing = set(slugs) - {badge.slug for badge in found}
        if missing:
            # Молча проглотить опечатку значило бы потерять бейдж без следа.
            raise ValidationError(f"Неизвестные бейджи: {', '.join(sorted(missing))}")
        for badge in found:
            self._uow.session.add(TourBadge(tour_id=tour_id, badge_id=badge.id))

    async def _replace_route_points(self, tour_id: str, points: list) -> None:
        await self._uow.session.execute(
            RoutePoint.__table__.delete().where(RoutePoint.tour_id == tour_id)
        )
        for index, point in enumerate(points):
            self._uow.session.add(
                RoutePoint(
                    tour_id=tour_id,
                    title=point.title,
                    description=point.description,
                    lat=point.lat,
                    lng=point.lng,
                    sort_order=index,
                )
            )

    def _to_detail(self, tour: Tour) -> AdminTourDetail:
        return AdminTourDetail(
            id=tour.id,
            slug=tour.slug,
            title=tour.title,
            subtitle=tour.subtitle,
            short_description=tour.short_description,
            full_description=tour.full_description,
            program=[ProgramStep.model_validate(step) for step in tour.program],
            price=tour.price,
            price_type=tour.price_type,
            duration_minutes=tour.duration_minutes,
            group_min=tour.group_min,
            group_max=tour.group_max,
            meeting_point=tour.meeting_point,
            meeting_lat=tour.meeting_lat,
            meeting_lng=tour.meeting_lng,
            included=tour.included,
            not_included=tour.not_included,
            recommendations=tour.recommendations,
            status=tour.status,
            sort_order=tour.sort_order,
            rating_avg=tour.rating_avg,
            rating_count=tour.rating_count,
            created_at=tour.created_at,
            updated_at=tour.updated_at,
            badges=[BadgeOut.model_validate(badge) for badge in tour.badges],
            images=[
                AdminImage(
                    id=image.id,
                    r2_key=image.r2_key,
                    alt=image.alt,
                    sort_order=image.sort_order,
                    variants=self._images.build(image).variants,
                )
                for image in sorted(tour.images, key=lambda i: i.sort_order)
            ],
            route_points=[
                AdminRoutePoint.model_validate(point)
                for point in sorted(tour.route_points, key=lambda p: p.sort_order)
            ],
            # В админке нужны все слоты, включая прошедшие: по ним видно,
            # что уже состоялось.
            schedules=[
                AdminScheduleOut.model_validate(slot)
                for slot in sorted(tour.schedules, key=lambda s: s.starts_at, reverse=True)
            ],
        )


class AdminScheduleService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def create(self, data: ScheduleCreate) -> Schedule:
        tour = await self._uow.tours.get(data.tour_id)
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")
        if data.starts_at <= datetime.now(UTC):
            raise ValidationError("Дата слота должна быть в будущем")

        slot = Schedule(
            tour_id=data.tour_id, starts_at=data.starts_at, capacity=data.capacity
        )
        self._uow.schedules.add(slot)
        await self._uow.flush()
        return slot

    async def update(self, slot_id: str, data: ScheduleUpdate) -> Schedule:
        slot = await self._uow.schedules.get(slot_id)
        if slot is None:
            raise NotFoundError("Слот расписания не найден")
        if data.capacity is not None and data.capacity < slot.booked_count:
            raise ConflictError(
                f"Нельзя уменьшить вместимость ниже занятых мест ({slot.booked_count})"
            )

        if data.starts_at is not None:
            slot.starts_at = data.starts_at
        if data.capacity is not None:
            slot.capacity = data.capacity
        if data.status is not None:
            slot.status = data.status
        return slot

    async def remove(self, slot_id: str) -> dict[str, object]:
        """Удаляет слот либо, если на нём висят живые брони, закрывает его.

        Физически удалить слот с бронями нельзя: у броней отвалилась бы
        дата, и гости остались бы с заявкой в никуда.
        """
        slot = await self._uow.schedules.get(slot_id)
        if slot is None:
            raise NotFoundError("Слот расписания не найден")

        active = await self._uow.bookings.count(
            Booking.schedule_id == slot_id, Booking.status.in_(ACTIVE_BOOKINGS)
        )
        if active > 0:
            slot.status = "cancelled"
            return {"id": slot_id, "cancelled": True}

        await self._uow.schedules.delete(slot)
        return {"id": slot_id, "deleted": True}

