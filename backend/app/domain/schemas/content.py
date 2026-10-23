"""Схемы отзывов, избранного и обращений."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.domain.schemas.common import CamelSchema, Schema, normalize_ru_phone
from app.domain.schemas.tours import TourCard

AuthorName = Annotated[str, StringConstraints(min_length=2, max_length=100)]


class ReviewCreate(Schema):
    tour_id: str = Field(alias="tourId", min_length=1)
    rating: int = Field(ge=1, le=5)
    text: Annotated[str, StringConstraints(min_length=10, max_length=2000)]
    #: Для отзывов без входа. У авторизованного имя берётся из профиля.
    author_name: AuthorName | None = Field(default=None, alias="authorName")


class ReviewCreated(Schema):
    id: str
    status: Literal["pending"]


class TourRefShort(Schema):
    slug: str
    title: str


class LatestReview(CamelSchema):
    """Отзыв для ленты на главной — вместе с названием экскурсии."""

    id: str
    author_name: str
    rating: int
    text: str
    created_at: datetime
    tour: TourRefShort


class FavoriteOut(CamelSchema):
    added_at: datetime
    tour: TourCard


class ContactRequestCreate(Schema):
    name: AuthorName
    phone: str | None = None
    email: str | None = None
    message: Annotated[str, StringConstraints(min_length=5, max_length=3000)]

    @field_validator("phone", mode="after")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        if not value:
            return None
        normalized = normalize_ru_phone(value)
        if normalized is None:
            raise ValueError("Некорректный номер телефона")
        return normalized

    @field_validator("email", mode="after")
    @classmethod
    def _normalize_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else None

    @model_validator(mode="after")
    def _needs_a_way_back(self) -> Self:
        # Обращение без контакта бесполезно: ответить будет некуда.
        if not self.phone and not self.email:
            raise ValueError("Укажите телефон или email для связи")
        return self


class ContactRequestCreated(Schema):
    id: str
    received: bool = True
