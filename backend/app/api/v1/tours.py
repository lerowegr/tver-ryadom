"""Маршруты каталога: экскурсии, бейджи, расписание, отзывы."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CatalogServiceDep
from app.core.responses import Envelope, Page, ok, paginated
from app.domain.schemas.common import Pagination
from app.domain.schemas.tours import (
    BadgeOut,
    ReviewOut,
    ScheduleEntry,
    TourCard,
    TourDetail,
    TourFilter,
)

router = APIRouter(tags=["tours"])

FilterDep = Annotated[TourFilter, Query()]
PaginationDep = Annotated[Pagination, Query()]


@router.get("/tours")
async def list_tours(service: CatalogServiceDep, filter_: FilterDep) -> Envelope[Page[TourCard]]:
    items, total = await service.list_tours(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.get("/tours/{slug}")
async def get_tour(slug: str, service: CatalogServiceDep) -> Envelope[TourDetail]:
    return ok(await service.get_tour(slug))


@router.get("/tours/{slug}/reviews")
async def list_tour_reviews(
    slug: str, service: CatalogServiceDep, page: PaginationDep
) -> Envelope[Page[ReviewOut]]:
    items, total = await service.list_reviews(slug, limit=page.limit, offset=page.offset)
    return paginated(items, total, page.page, page.limit)


@router.get("/badges")
async def list_badges(service: CatalogServiceDep) -> Envelope[list[BadgeOut]]:
    return ok(await service.list_badges())


@router.get("/schedule")
async def list_schedule(service: CatalogServiceDep) -> Envelope[dict[str, list[ScheduleEntry]]]:
    """Расписание сборных выходов по всем экскурсиям.

    Ответ обёрнут в объект с `items`, а не отдан списком: так в него можно
    будет добавить поля, не ломая разбор на сайте.
    """
    return ok({"items": await service.list_schedule()})
