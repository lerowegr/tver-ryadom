"""Сотрудники, брони, отзывы и обращения глазами администратора."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError
from app.core.security import PasswordHasher
from app.core.unit_of_work import UnitOfWork
from app.domain.models.auth import User
from app.domain.models.bookings import Booking
from app.domain.models.content import ContactRequest, Review, Setting
from app.domain.schemas.admin import (
    AdminBookingFilter,
    AdminBookingOut,
    AdminRequestOut,
    AdminReviewCreate,
    AdminReviewOut,
    AdminUserCreate,
    AdminUserOut,
    RequestFilter,
    ReviewFilter,
    TourRef,
    UserFilter,
    UserRef,
)


class AdminBookingService:
    """Только чтение: смена статуса живёт в BookingService — ровно то же
    самое делает бот, и две копии правил разошлись бы."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_bookings(
        self, filter_: AdminBookingFilter
    ) -> tuple[list[AdminBookingOut], int]:
        conditions = []
        if filter_.status:
            conditions.append(Booking.status == filter_.status)
        if filter_.tour_id:
            conditions.append(Booking.tour_id == filter_.tour_id)

        total = await self._uow.bookings.count(*conditions)
        rows = await self._uow.session.execute(
            select(Booking)
            .where(*conditions)
            .order_by(Booking.created_at.desc())
            .limit(filter_.limit)
            .offset(filter_.offset)
            .options(
                selectinload(Booking.tour),
                selectinload(Booking.schedule),
                selectinload(Booking.user),
            )
        )
        bookings = list(rows.scalars().unique().all())
        return [self._to_out(booking) for booking in bookings], total

    @staticmethod
    def _to_out(booking: Booking) -> AdminBookingOut:
        return AdminBookingOut(
            id=booking.id,
            status=booking.status,
            payment_status=booking.payment_status,
            people_count=booking.people_count,
            total_price=booking.total_price,
            starts_at=booking.starts_at,
            contact_name=booking.contact_name,
            contact_phone=booking.contact_phone,
            contact_email=booking.contact_email,
            comment=booking.comment,
            admin_comment=booking.admin_comment,
            cancel_reason=booking.cancel_reason,
            source=booking.source,
            created_at=booking.created_at,
            tour=(
                TourRef(id=booking.tour.id, slug=booking.tour.slug, title=booking.tour.title)
                if booking.tour
                else None
            ),
            user=(
                UserRef(id=booking.user.id, name=booking.user.name, email=booking.user.email)
                if booking.user
                else None
            ),
        )


class AdminReviewService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_reviews(self, filter_: ReviewFilter) -> tuple[list[AdminReviewOut], int]:
        conditions = []
        if filter_.status:
            conditions.append(Review.status == filter_.status)
        if filter_.tour_id:
            conditions.append(Review.tour_id == filter_.tour_id)

        total = await self._uow.reviews.count(*conditions)
        rows = await self._uow.session.execute(
            select(Review)
            .where(*conditions)
            .order_by(Review.created_at.desc())
            .limit(filter_.limit)
            .offset(filter_.offset)
            .options(selectinload(Review.tour))
        )
        reviews = list(rows.scalars().unique().all())
        return [self._to_out(review) for review in reviews], total

    async def create(self, data: AdminReviewCreate) -> Review:
        tour = await self._uow.tours.get(data.tour_id)
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")

        review = Review(
            tour_id=data.tour_id,
            author_name=data.author_name,
            rating=data.rating,
            text=data.text,
            status=data.status,
        )
        if data.created_at is not None:
            review.created_at = data.created_at
        self._uow.reviews.add(review)
        await self._uow.flush()
        await self._uow.reviews.recalc_tour_rating(data.tour_id)
        return review

    async def moderate(self, review_id: str, status: str) -> Review:
        review = await self._uow.reviews.get(review_id)
        if review is None:
            raise NotFoundError("Отзыв не найден")
        review.status = status  # type: ignore[assignment]
        await self._uow.flush()
        await self._uow.reviews.recalc_tour_rating(review.tour_id)
        return review

    async def remove(self, review_id: str) -> None:
        """Совсем убрать отзыв — для спама и записей, которых быть не должно."""
        review = await self._uow.reviews.get(review_id)
        if review is None:
            raise NotFoundError("Отзыв не найден")
        tour_id = review.tour_id
        await self._uow.reviews.delete(review)
        await self._uow.flush()
        await self._uow.reviews.recalc_tour_rating(tour_id)

    @staticmethod
    def _to_out(review: Review) -> AdminReviewOut:
        return AdminReviewOut(
            id=review.id,
            author_name=review.author_name,
            rating=review.rating,
            text=review.text,
            status=review.status,
            created_at=review.created_at,
            tour=TourRef(id=review.tour.id, slug=review.tour.slug, title=review.tour.title),
        )


class AdminRequestService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_requests(self, filter_: RequestFilter) -> tuple[list[AdminRequestOut], int]:
        conditions = []
        if filter_.status:
            conditions.append(ContactRequest.status == filter_.status)

        total = await self._uow.requests.count(*conditions)
        requests = await self._uow.requests.find_many(
            *conditions,
            order_by=[ContactRequest.created_at.desc()],
            limit=filter_.limit,
            offset=filter_.offset,
        )
        return [AdminRequestOut.model_validate(item) for item in requests], total

    async def set_status(self, request_id: str, status: str) -> ContactRequest:
        request = await self._uow.requests.get(request_id)
        if request is None:
            raise NotFoundError("Заявка не найдена")
        request.status = status  # type: ignore[assignment]
        return request


class AdminUserService:
    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher) -> None:
        self._uow = uow
        self._hasher = hasher

    async def list_users(self, filter_: UserFilter) -> tuple[list[AdminUserOut], int]:
        conditions = []
        if filter_.search:
            pattern = f"%{filter_.search}%"
            conditions.append(
                User.name.ilike(pattern)
                | User.email.ilike(pattern)
                | User.phone.ilike(pattern)
            )

        total = await self._uow.users.count(*conditions)
        # Число броней считается здесь же: отдельным запросом на каждого
        # получилась бы страница из пятидесяти обращений к базе.
        rows = await self._uow.session.execute(
            select(User, func.count(Booking.id))
            .outerjoin(Booking, Booking.user_id == User.id)
            .where(*conditions)
            .group_by(User.id)
            .order_by(User.created_at.desc())
            .limit(filter_.limit)
            .offset(filter_.offset)
        )
        items = [
            AdminUserOut(
                id=user.id,
                name=user.name,
                email=user.email,
                phone=user.phone,
                role=user.role,
                email_verified_at=user.email_verified_at,
                telegram_chat_id=user.telegram_chat_id,
                created_at=user.created_at,
                bookings_count=count,
            )
            for user, count in rows.all()
        ]
        return items, total

    async def create(self, data: AdminUserCreate) -> User:
        if await self._uow.users.email_taken(data.email):
            raise ConflictError("Пользователь с таким email уже есть")

        user = User(
            email=data.email,
            name=data.name,
            password_hash=self._hasher.hash(data.password),
            role=data.role,
        )
        self._uow.users.add(user)
        await self._uow.flush()
        return user

    async def set_role(self, user_id: str, role: str, *, actor_id: str) -> User:
        user = await self._uow.users.get(user_id)
        if user is None:
            raise NotFoundError("Пользователь не найден")

        if role != "admin":
            # Снять права с себя — верный способ закрыть себе доступ в панель.
            if actor_id == user_id:
                raise ConflictError("Нельзя снять права администратора с самого себя")
            others = await self._uow.users.count(User.role == "admin", User.id != user_id)
            if others == 0:
                raise ConflictError("Это последний администратор")

        user.role = role  # type: ignore[assignment]
        # Новая роль вступает сразу: цепочки обновления гасим, а выданный
        # access-токен умрёт сам в течение четверти часа.
        await self._uow.sessions.revoke_all_for_user(user_id)
        return user


class SettingsService:
    """Настройки сайта: контакты, тексты разделов, служебные значения."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def all(self) -> dict[str, object]:
        rows = await self._uow.session.execute(select(Setting))
        return {row.key: row.value for row in rows.scalars().all()}

    async def public(self) -> dict[str, object]:
        """Что отдаётся сайту: контакты, компания, тексты разделов.

        Белым списком, а не чёрным: новая служебная настройка не должна
        утечь наружу просто потому, что о ней забыли.
        """
        allowed = ("contacts.", "company.", "about.", "home.", "schedule.")
        return {
            key: value
            for key, value in (await self.all()).items()
            if key.startswith(allowed)
        }

    async def update(self, entries: dict[str, object]) -> int:
        for key, value in entries.items():
            existing = await self._uow.session.get(Setting, key)
            if existing is None:
                self._uow.session.add(Setting(key=key, value=value))
            else:
                existing.value = value
        return len(entries)

