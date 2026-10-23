"""Схемы уведомлений и очереди доставки."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.domain.schemas.common import CamelSchema, Pagination, Schema


class NotificationOut(CamelSchema):
    id: str
    type: str
    payload: dict[str, Any] | None
    read_at: datetime | None
    created_at: datetime


class NotificationPageOut(CamelSchema):
    """Страница плюс счётчик непрочитанных — его показывает значок в шапке."""

    items: list[NotificationOut]
    total: int
    unread: int
    page: int
    limit: int
    pages: int


class MarkReadRequest(Schema):
    #: Без списка помечаются прочитанными все.
    ids: list[str] | None = Field(default=None, max_length=100)


class OutboxFilter(Pagination):
    status: Literal["pending", "sent", "failed"] | None = None
    channel: str | None = None


class AdminOutboxItem(CamelSchema):
    id: str
    channel: str
    recipient: str
    template: str
    payload: dict[str, Any] | None
    status: Literal["pending", "sent", "failed"]
    attempts: int
    last_error: str | None
    scheduled_at: datetime
    sent_at: datetime | None
    created_at: datetime
