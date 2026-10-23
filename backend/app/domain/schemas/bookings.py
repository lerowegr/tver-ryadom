"""Схемы бронирования."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.domain.schemas.common import CamelSchema, Pagination, Schema, normalize_ru_phone

BookingStatus = Literal["pending", "confirmed", "cancelled", "completed"]


class TourRef(Schema):
    """Короткая ссылка на экскурсию внутри брони."""

    id: str
    slug: str
    title: str


class BookingCreate(Schema):
    tour_id: str = Field(alias="tourId", min_length=1)
    #: Либо слот расписания…
    schedule_id: str | None = Field(default=None, alias="scheduleId")
    #: …либо своя дата, если подходящего слота нет.
    desired_date: datetime | None = Field(default=None, alias="desiredDate")
    people_count: int = Field(alias="peopleCount", ge=1, le=50)
    contact_name: Annotated[str, StringConstraints(min_length=2, max_length=100)] = Field(
        alias="contactName"
    )
    contact_phone: str = Field(alias="contactPhone")
    contact_email: str | None = Field(default=None, alias="contactEmail")
    comment: str | None = Field(default=None, max_length=2000)
    #: Токен виджета «я не робот». Нужен только гостям и только
    #: когда проверка подключена.
    cf_token: str | None = Field(default=None, alias="cfToken", max_length=4000)

    @field_validator("contact_phone", mode="after")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        """Телефон приводится к +7XXXXXXXXXX сразу: дальше по коду он
        используется как идентификатор гостя, и «8 910» с «+7 910» не
        должны оказаться разными людьми."""
        normalized = normalize_ru_phone(value)
        if normalized is None:
            raise ValueError("Некорректный номер телефона")
        return normalized

    @model_validator(mode="after")
    def _needs_a_date(self) -> Self:
        if not self.schedule_id and not self.desired_date:
            raise ValueError("Выберите дату из расписания или укажите желаемую дату")
        return self


class BookingCancel(Schema):
    reason: str | None = Field(default=None, max_length=1000)


class BookingListFilter(Pagination):
    status: BookingStatus | None = None
    tour_id: str | None = Field(default=None, alias="tourId")
    #: Только будущие или только прошедшие. Не задано — все.
    upcoming: bool | None = None


class BookingCreated(CamelSchema):
    """Ответ на заявку: ровно столько, сколько нужно экрану «готово»."""

    id: str
    status: BookingStatus
    total_price: int
    starts_at: datetime | None
    tour: TourRef


class BookingOut(CamelSchema):
    """Бронь в личном кабинете."""

    id: str
    status: BookingStatus
    payment_status: Literal["none", "pending", "paid", "refunded"]
    people_count: int
    total_price: int
    starts_at: datetime | None
    contact_name: str
    contact_phone: str
    contact_email: str | None
    comment: str | None
    cancel_reason: str | None
    created_at: datetime
    tour: TourRef | None
