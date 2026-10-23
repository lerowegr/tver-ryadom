"""Маршруты уведомлений личного кабинета."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUserDep, NotificationServiceDep, UowDep
from app.core.responses import Envelope, Page, ok
from app.domain.schemas.common import Pagination
from app.domain.schemas.notifications import MarkReadRequest, NotificationPageOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    service: NotificationServiceDep,
    user: CurrentUserDep,
    page: Annotated[Pagination, Query()],
) -> Envelope[NotificationPageOut]:
    result = await service.list_for(user.user_id, limit=page.limit, offset=page.offset)
    meta = Page.of(result.items, result.total, page.page, page.limit)
    return ok(
        NotificationPageOut(
            items=result.items,
            total=result.total,
            unread=result.unread,
            page=meta.page,
            limit=meta.limit,
            pages=meta.pages,
        )
    )


@router.post("/read")
async def mark_read(
    data: MarkReadRequest,
    service: NotificationServiceDep,
    user: CurrentUserDep,
    uow: UowDep,
) -> Envelope[dict[str, bool]]:
    await service.mark_read(user.user_id, data.ids)
    await uow.commit()
    return ok({"read": True})
