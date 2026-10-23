"""Маршруты бронирования и занятости."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import (
    AvailabilityServiceDep,
    BookingServiceDep,
    CurrentUserDep,
    OptionalUserDep,
    UowDep,
    require_captcha,
)
from app.core.rate_limit import RULES, RateLimit
from app.core.responses import Envelope, Page, ok, paginated
from app.domain.schemas.availability import AvailabilityRange, PublicBlock
from app.domain.schemas.bookings import (
    BookingCancel,
    BookingCreate,
    BookingCreated,
    BookingListFilter,
    BookingOut,
)

router = APIRouter(tags=["bookings"])


@router.post(
    "/bookings",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit(RULES["booking"])), Depends(require_captcha)],
)
async def create_booking(
    data: BookingCreate,
    service: BookingServiceDep,
    user: OptionalUserDep,
    uow: UowDep,
) -> Envelope[BookingCreated]:
    """Бронирование доступно и гостю.

    Протухший или отозванный токен делает заявку гостевой, а не чужой:
    `user` подставляется только если подпись прошла проверку.
    """
    booking = await service.create(data, user_id=user.user_id if user else None)
    await uow.commit()
    return ok(booking)


@router.get("/bookings/my")
async def list_my_bookings(
    service: BookingServiceDep,
    user: CurrentUserDep,
    filter_: Annotated[BookingListFilter, Query()],
) -> Envelope[Page[BookingOut]]:
    items, total = await service.list_mine(user.user_id, filter_)
    return paginated(items, total, filter_.page, filter_.limit)


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    data: BookingCancel,
    service: BookingServiceDep,
    user: CurrentUserDep,
    uow: UowDep,
) -> Envelope[dict[str, bool]]:
    await service.cancel_own(user.user_id, booking_id, data.reason)
    await uow.commit()
    return ok({"cancelled": True})


@router.get("/availability")
async def list_availability(
    service: AvailabilityServiceDep,
    range_: Annotated[AvailabilityRange, Query()],
) -> Envelope[dict[str, list[PublicBlock]]]:
    """Занятость для формы бронирования — без заметок экскурсовода."""
    blocks = await service.list_public(range_.from_date, range_.to_date)
    return ok({"blocks": blocks})
