"""Схемы административной панели.

Отдельно от публичных намеренно: админке видно больше — комментарии для
себя, контакты гостей, служебные статусы. Общая схема на оба случая рано
или поздно протекла бы наружу.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import EmailStr, Field, StringConstraints, field_validator

from app.domain.schemas.common import CamelSchema, Pagination, Schema, Slug
from app.domain.schemas.tours import BadgeOut, ProgramStep

TourStatus = Literal["draft", "published", "archived"]
BookingStatus = Literal["pending", "confirmed", "cancelled", "completed"]
ReviewStatus = Literal["pending", "approved", "rejected"]
RequestStatus = Literal["new", "processed"]
ScheduleStatus = Literal["open", "closed", "cancelled"]
UserRole = Literal["user", "admin"]

Title = Annotated[str, StringConstraints(min_length=3, max_length=200)]


# ---- Экскурсии --------------------------------------------------------------


class RoutePointInput(Schema):
    title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    description: str | None = Field(default=None, max_length=2000)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class TourCreate(Schema):
    slug: Slug
    title: Title
    subtitle: str | None = Field(default=None, max_length=300)
    short_description: Annotated[str, StringConstraints(min_length=10, max_length=500)] = Field(
        alias="shortDescription"
    )
    full_description: Annotated[str, StringConstraints(min_length=10, max_length=20000)] = Field(
        alias="fullDescription"
    )
    program: list[ProgramStep] = Field(default_factory=list)
    route_points: list[RoutePointInput] = Field(default_factory=list, alias="routePoints")
    price: int = Field(gt=0, description="Копейки")
    price_type: Literal["per_person", "per_group"] = Field(
        default="per_person", alias="priceType"
    )
    duration_minutes: int = Field(gt=0, alias="durationMinutes")
    group_min: int = Field(default=1, ge=1, alias="groupMin")
    group_max: int | None = Field(default=None, ge=1, alias="groupMax")
    meeting_point: str | None = Field(default=None, max_length=500, alias="meetingPoint")
    meeting_lat: float | None = Field(default=None, ge=-90, le=90, alias="meetingLat")
    meeting_lng: float | None = Field(default=None, ge=-180, le=180, alias="meetingLng")
    included: list[str] = Field(default_factory=list)
    not_included: list[str] = Field(default_factory=list, alias="notIncluded")
    recommendations: str | None = Field(default=None, max_length=5000)
    status: TourStatus = "draft"
    badge_slugs: list[str] = Field(default_factory=list, alias="badgeSlugs")
    sort_order: int = Field(default=0, alias="sortOrder")


class TourUpdate(Schema):
    """То же, но всё необязательно: правится по одному полю."""

    slug: Slug | None = None
    title: Title | None = None
    subtitle: str | None = Field(default=None, max_length=300)
    short_description: str | None = Field(default=None, alias="shortDescription", max_length=500)
    full_description: str | None = Field(default=None, alias="fullDescription", max_length=20000)
    program: list[ProgramStep] | None = None
    route_points: list[RoutePointInput] | None = Field(default=None, alias="routePoints")
    price: int | None = Field(default=None, gt=0)
    price_type: Literal["per_person", "per_group"] | None = Field(default=None, alias="priceType")
    duration_minutes: int | None = Field(default=None, gt=0, alias="durationMinutes")
    group_min: int | None = Field(default=None, ge=1, alias="groupMin")
    group_max: int | None = Field(default=None, ge=1, alias="groupMax")
    meeting_point: str | None = Field(default=None, max_length=500, alias="meetingPoint")
    meeting_lat: float | None = Field(default=None, ge=-90, le=90, alias="meetingLat")
    meeting_lng: float | None = Field(default=None, ge=-180, le=180, alias="meetingLng")
    included: list[str] | None = None
    not_included: list[str] | None = Field(default=None, alias="notIncluded")
    recommendations: str | None = Field(default=None, max_length=5000)
    status: TourStatus | None = None
    badge_slugs: list[str] | None = Field(default=None, alias="badgeSlugs")
    sort_order: int | None = Field(default=None, alias="sortOrder")


class TourFilter(Pagination):
    status: TourStatus | None = None
    search: str | None = Field(default=None, max_length=200)


class AdminTourListItem(CamelSchema):
    id: str
    slug: str
    title: str
    status: TourStatus
    price: int
    price_type: Literal["per_person", "per_group"]
    duration_minutes: int
    rating_avg: float
    rating_count: int
    sort_order: int


class AdminImage(CamelSchema):
    """В админке у фотографии нужны ещё порядок и идентификатор:
    их видит форма редактирования галереи."""

    id: str
    r2_key: str
    alt: str | None
    sort_order: int
    variants: dict[str, str]


class AdminRoutePoint(CamelSchema):
    """Точка маршрута в панели: с идентификатором и порядком — форма
    редактирования объявляет их в своём типе."""

    id: str
    title: str
    description: str | None
    lat: float
    lng: float
    sort_order: int


class AdminScheduleOut(CamelSchema):
    id: str
    starts_at: datetime
    capacity: int
    booked_count: int
    status: ScheduleStatus


class AdminTourDetail(CamelSchema):
    id: str
    slug: str
    title: str
    subtitle: str | None
    short_description: str
    full_description: str
    program: list[ProgramStep]
    price: int
    price_type: Literal["per_person", "per_group"]
    duration_minutes: int
    group_min: int
    group_max: int | None
    meeting_point: str | None
    meeting_lat: float | None
    meeting_lng: float | None
    included: list[str]
    not_included: list[str]
    recommendations: str | None
    status: TourStatus
    sort_order: int
    rating_avg: float
    rating_count: int
    created_at: datetime
    updated_at: datetime
    badges: list[BadgeOut]
    images: list[AdminImage]
    route_points: list[AdminRoutePoint]
    schedules: list[AdminScheduleOut]


# ---- Расписание -------------------------------------------------------------


class ScheduleCreate(Schema):
    tour_id: str = Field(alias="tourId", min_length=1)
    starts_at: datetime = Field(alias="startsAt")
    capacity: int = Field(ge=1, le=200)


class ScheduleUpdate(Schema):
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    capacity: int | None = Field(default=None, ge=1, le=200)
    status: ScheduleStatus | None = None


# ---- Брони ------------------------------------------------------------------


class AdminBookingFilter(Pagination):
    status: BookingStatus | None = None
    tour_id: str | None = Field(default=None, alias="tourId")


class BookingStatusUpdate(Schema):
    status: BookingStatus
    admin_comment: str | None = Field(default=None, alias="adminComment", max_length=2000)


class UserRef(Schema):
    id: str
    name: str
    email: str | None


class TourRef(Schema):
    id: str
    slug: str
    title: str


class AdminBookingOut(CamelSchema):
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
    admin_comment: str | None
    cancel_reason: str | None
    source: str
    created_at: datetime
    tour: TourRef | None
    user: UserRef | None


# ---- Отзывы -----------------------------------------------------------------


class ReviewFilter(Pagination):
    status: ReviewStatus | None = None
    tour_id: str | None = Field(default=None, alias="tourId")


class ReviewModerate(Schema):
    status: ReviewStatus


class AdminReviewCreate(Schema):
    """Отзыв, заведённый вручную.

    Елена получает их в мессенджерах и переносит с площадок, поэтому нужен
    способ внести отзыв мимо формы на сайте. По умолчанию сразу опубликован:
    модерировать собственную запись незачем.
    """

    tour_id: str = Field(alias="tourId", min_length=1)
    author_name: Annotated[str, StringConstraints(min_length=2, max_length=100)] = Field(
        alias="authorName"
    )
    rating: int = Field(ge=1, le=5)
    text: Annotated[str, StringConstraints(min_length=10, max_length=2000)]
    status: ReviewStatus = "approved"
    #: Дата отзыва на площадке, откуда он перенесён: сегодняшним числом
    #: прошлогодний отзыв выглядел бы свежим.
    created_at: datetime | None = Field(default=None, alias="createdAt")


class AdminReviewOut(CamelSchema):
    id: str
    author_name: str
    rating: int
    text: str
    status: ReviewStatus
    created_at: datetime
    tour: TourRef


# ---- Пользователи -----------------------------------------------------------


class UserFilter(Pagination):
    search: str | None = Field(default=None, max_length=200)


class AdminUserCreate(Schema):
    email: EmailStr
    name: Annotated[str, StringConstraints(min_length=2, max_length=100)]
    #: Сотруднику с доступом в панель — пароль длиннее обычного.
    password: Annotated[str, StringConstraints(min_length=10, max_length=200)]
    role: UserRole = "admin"

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()


class RoleUpdate(Schema):
    role: UserRole


class AdminUserOut(CamelSchema):
    id: str
    name: str
    email: str | None
    phone: str | None
    role: UserRole
    email_verified_at: datetime | None
    telegram_chat_id: str | None
    created_at: datetime
    bookings_count: int


# ---- Обращения --------------------------------------------------------------


class RequestFilter(Pagination):
    status: RequestStatus | None = None


class RequestStatusUpdate(Schema):
    status: RequestStatus


class AdminRequestOut(CamelSchema):
    id: str
    name: str
    phone: str | None
    email: str | None
    message: str
    status: RequestStatus
    created_at: datetime


# ---- Настройки --------------------------------------------------------------


class SettingsUpdate(Schema):
    entries: dict[str, Any]


# ---- Календарь и сводка -----------------------------------------------------


class CalendarGuest(Schema):
    name: str
    phone: str
    people: int
    status: str


class CalendarEntry(CamelSchema):
    """Событие календаря: слот расписания либо заявка на свою дату.

    Брони, привязанные к слоту, отдельными событиями не идут — иначе в
    календаре двоилось бы; они перечислены внутри слота.
    """

    id: str
    kind: Literal["slot", "request"]
    tour_id: str
    tour_title: str
    starts_at: datetime
    duration_minutes: int
    status: str
    meeting_point: str | None = None
    capacity: int | None = None
    booked: int | None = None
    people: int | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    guests: list[CalendarGuest] | None = None


class DayCount(Schema):
    day: str
    total: int


class RecentBooking(CamelSchema):
    id: str
    status: BookingStatus
    contact_name: str
    people_count: int
    total_price: int
    created_at: datetime
    starts_at: datetime | None
    tour: TourRef | None


class DashboardStats(CamelSchema):
    bookings_today: int
    pending_bookings: int
    upcoming_bookings: int
    revenue: int
    pending_reviews: int
    new_requests: int
    failed_notifications: int
    bookings_by_day: list[DayCount]
    recent_bookings: list[RecentBooking]
