"""Маршруты административной панели.

Весь раздел закрыт проверкой роли на уровне роутера: забыть её на одном
обработчике из двадцати слишком легко, а цена ошибки — чужие контакты
и чужие брони наружу.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import (
    AdminBookingServiceDep,
    AdminCalendarServiceDep,
    AdminDep,
    AdminRequestServiceDep,
    AdminReviewServiceDep,
    AdminScheduleServiceDep,
    AdminTourServiceDep,
    AdminUserServiceDep,
    AvailabilityServiceDep,
    BookingServiceDep,
    DashboardServiceDep,
    SettingsServiceDep,
    UowDep,
    require_admin,
)
from app.core.errors import ValidationError
from app.core.responses import Envelope, Page, ok, paginated
from app.domain.schemas.admin import (
    AdminBookingFilter,
    AdminBookingOut,
    AdminRequestOut,
    AdminReviewCreate,
    AdminReviewOut,
    AdminTourDetail,
    AdminTourListItem,
    AdminUserCreate,
    AdminUserOut,
    BookingStatusUpdate,
    CalendarEntry,
    DashboardStats,
    RequestFilter,
    RequestStatusUpdate,
    ReviewFilter,
    ReviewModerate,
    RoleUpdate,
    ScheduleCreate,
    ScheduleUpdate,
    SettingsUpdate,
    TourCreate,
    TourFilter,
    TourUpdate,
    UserFilter,
)
from app.domain.schemas.availability import (
    AvailabilityBlockCreate,
    AvailabilityBlockOut,
    AvailabilityRange,
    MskDate,
)
from app.services.admin.calendar import MAX_DAYS

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---- Сводка -----------------------------------------------------------------


@router.get("/stats")
async def stats(service: DashboardServiceDep) -> Envelope[DashboardStats]:
    return ok(await service.stats())


# ---- Экскурсии --------------------------------------------------------------


@router.get("/tours")
async def list_tours(
    service: AdminTourServiceDep, filter_: Annotated[TourFilter, Query()]
) -> Envelope[Page[AdminTourListItem]]:
    items, total = await service.list_tours(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.get("/tours/{tour_id}")
async def get_tour(tour_id: str, service: AdminTourServiceDep) -> Envelope[AdminTourDetail]:
    return ok(await service.get_tour(tour_id))


@router.post("/tours", status_code=status.HTTP_201_CREATED)
async def create_tour(
    data: TourCreate, service: AdminTourServiceDep, uow: UowDep
) -> Envelope[AdminTourDetail]:
    tour = await service.create(data)
    await uow.commit()
    return ok(tour)


@router.patch("/tours/{tour_id}")
async def update_tour(
    tour_id: str, data: TourUpdate, service: AdminTourServiceDep, uow: UowDep
) -> Envelope[AdminTourDetail]:
    tour = await service.update(tour_id, data)
    await uow.commit()
    return ok(tour)


@router.delete("/tours/{tour_id}")
async def archive_tour(
    tour_id: str, service: AdminTourServiceDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.archive(tour_id)
    await uow.commit()
    return ok({"archived": True})


# ---- Расписание -------------------------------------------------------------


@router.post("/schedules", status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ScheduleCreate, service: AdminScheduleServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    slot = await service.create(data)
    await uow.commit()
    return ok({"id": slot.id})


@router.patch("/schedules/{slot_id}")
async def update_schedule(
    slot_id: str, data: ScheduleUpdate, service: AdminScheduleServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    slot = await service.update(slot_id, data)
    await uow.commit()
    return ok({"id": slot.id})


@router.delete("/schedules/{slot_id}")
async def delete_schedule(
    slot_id: str, service: AdminScheduleServiceDep, uow: UowDep
) -> Envelope[dict[str, object]]:
    result = await service.remove(slot_id)
    await uow.commit()
    return ok(result)


# ---- Брони ------------------------------------------------------------------


@router.get("/bookings")
async def list_bookings(
    service: AdminBookingServiceDep, filter_: Annotated[AdminBookingFilter, Query()]
) -> Envelope[Page[AdminBookingOut]]:
    items, total = await service.list_bookings(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.patch("/bookings/{booking_id}")
async def change_booking_status(
    booking_id: str,
    data: BookingStatusUpdate,
    service: BookingServiceDep,
    uow: UowDep,
) -> Envelope[dict[str, str]]:
    """Правила перехода, возврат мест и уведомления живут в общей службе:
    ровно то же самое делает бот."""
    booking = await service.change_status(booking_id, data.status, data.admin_comment)
    await uow.commit()
    return ok({"id": booking.id, "status": booking.status})


# ---- Отзывы -----------------------------------------------------------------


@router.get("/reviews")
async def list_reviews(
    service: AdminReviewServiceDep, filter_: Annotated[ReviewFilter, Query()]
) -> Envelope[Page[AdminReviewOut]]:
    items, total = await service.list_reviews(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.post("/reviews", status_code=status.HTTP_201_CREATED)
async def create_review(
    data: AdminReviewCreate, service: AdminReviewServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    review = await service.create(data)
    await uow.commit()
    return ok({"id": review.id, "status": review.status})


@router.patch("/reviews/{review_id}")
async def moderate_review(
    review_id: str, data: ReviewModerate, service: AdminReviewServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    review = await service.moderate(review_id, data.status)
    await uow.commit()
    return ok({"id": review.id, "status": review.status})


@router.delete("/reviews/{review_id}")
async def delete_review(
    review_id: str, service: AdminReviewServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    await service.remove(review_id)
    await uow.commit()
    return ok({"id": review_id})


# ---- Обращения --------------------------------------------------------------


@router.get("/contact-requests")
async def list_requests(
    service: AdminRequestServiceDep, filter_: Annotated[RequestFilter, Query()]
) -> Envelope[Page[AdminRequestOut]]:
    items, total = await service.list_requests(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.patch("/contact-requests/{request_id}")
async def set_request_status(
    request_id: str, data: RequestStatusUpdate, service: AdminRequestServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    request = await service.set_status(request_id, data.status)
    await uow.commit()
    return ok({"id": request.id})


# ---- Сотрудники -------------------------------------------------------------


@router.get("/users")
async def list_users(
    service: AdminUserServiceDep, filter_: Annotated[UserFilter, Query()]
) -> Envelope[Page[AdminUserOut]]:
    items, total = await service.list_users(filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreate, service: AdminUserServiceDep, uow: UowDep
) -> Envelope[dict[str, str]]:
    user = await service.create(data)
    await uow.commit()
    return ok({"id": user.id, "email": user.email or "", "role": user.role})


@router.patch("/users/{user_id}/role")
async def set_user_role(
    user_id: str,
    data: RoleUpdate,
    service: AdminUserServiceDep,
    actor: AdminDep,
    uow: UowDep,
) -> Envelope[dict[str, str]]:
    user = await service.set_role(user_id, data.role, actor_id=actor.user_id)
    await uow.commit()
    return ok({"id": user.id, "role": user.role})


# ---- Настройки --------------------------------------------------------------


@router.get("/settings")
async def get_settings(service: SettingsServiceDep) -> Envelope[dict[str, object]]:
    return ok(await service.all())


@router.put("/settings")
async def update_settings(
    data: SettingsUpdate, service: SettingsServiceDep, uow: UowDep
) -> Envelope[dict[str, int]]:
    saved = await service.update(data.entries)
    await uow.commit()
    return ok({"saved": saved})


# ---- Занятость --------------------------------------------------------------


@router.get("/availability")
async def list_availability(
    service: AvailabilityServiceDep, range_: Annotated[AvailabilityRange, Query()]
) -> Envelope[dict[str, list[AvailabilityBlockOut]]]:
    blocks = await service.list_admin(range_.from_date, range_.to_date)
    return ok({"blocks": blocks})


@router.post("/availability", status_code=status.HTTP_201_CREATED)
async def close_period(
    data: AvailabilityBlockCreate, service: AvailabilityServiceDep, uow: UowDep
) -> Envelope[dict[str, list[AvailabilityBlockOut]]]:
    blocks = await service.close(data)
    await uow.commit()
    return ok({"blocks": blocks})


@router.delete("/availability/day/{date}")
async def open_day(
    date: MskDate, service: AvailabilityServiceDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.open_day(date)
    await uow.commit()
    return ok({"ok": True})


@router.delete("/availability/{block_id}")
async def remove_block(
    block_id: str, service: AvailabilityServiceDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.remove(block_id)
    await uow.commit()
    return ok({"ok": True})


# ---- Календарь --------------------------------------------------------------


@router.get("/calendar")
async def calendar(
    service: AdminCalendarServiceDep, range_: Annotated[AvailabilityRange, Query()]
) -> Envelope[dict[str, list[CalendarEntry]]]:
    start = datetime.fromisoformat(f"{range_.from_date}T00:00:00").replace(tzinfo=UTC)
    # Сутки «по» включаются целиком, иначе вечерние слоты последнего дня
    # выпадали бы из выдачи.
    end = datetime.fromisoformat(f"{range_.to_date}T23:59:59").replace(tzinfo=UTC)

    if (end - start).days > MAX_DAYS:
        raise ValidationError(f"Период больше {MAX_DAYS} дней — это уже выгрузка")

    return ok({"entries": await service.load_range(start, end)})
