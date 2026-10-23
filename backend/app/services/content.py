"""Отзывы, избранное и обращения.

Три маленьких сервиса рядом: каждый отвечает за своё, но все трое живут
на одной странице экскурсии и в кабинете, и разносить их по файлам ради
симметрии значило бы множить переходы при чтении.
"""

from __future__ import annotations

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.content import ContactRequest, Favorite, Review
from app.domain.models.tours import Tour
from app.domain.schemas.content import (
    ContactRequestCreate,
    ContactRequestCreated,
    FavoriteOut,
    LatestReview,
    ReviewCreate,
    ReviewCreated,
    TourRefShort,
)
from app.services.notifications import Notifier
from app.services.tours import TourCatalogService


class ReviewService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def latest(self, limit: int = 6) -> list[LatestReview]:
        """Лента на главной."""
        reviews = await self._uow.reviews.latest(limit)
        return [
            LatestReview(
                id=review.id,
                author_name=review.author_name,
                rating=review.rating,
                text=review.text,
                created_at=review.created_at,
                tour=TourRefShort(slug=review.tour.slug, title=review.tour.title),
            )
            for review in reviews
        ]

    async def create(self, data: ReviewCreate, user_id: str | None = None) -> ReviewCreated:
        """Принимает отзыв и отправляет его на модерацию.

        Опубликованным он станет только после проверки: иначе на странице
        экскурсии мог бы появиться кто угодно с чем угодно.
        """
        tour = await self._uow.tours.find_one(
            Tour.id == data.tour_id, Tour.status == "published"
        )
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")

        author_name = data.author_name
        if user_id:
            author = await self._uow.users.get(user_id)
            # Имя из профиля перебивает присланное: подписаться чужим
            # именем из своего аккаунта не должно получаться.
            if author is not None:
                author_name = author.name
            if await self._uow.reviews.by_user_and_tour(user_id, tour.id):
                raise ConflictError("Вы уже оставляли отзыв на эту экскурсию")

        if not author_name:
            raise ValidationError("Укажите имя", details={"authorName": "Укажите имя"})

        review = Review(
            tour_id=tour.id,
            user_id=user_id,
            author_name=author_name,
            rating=data.rating,
            text=data.text,
            status="pending",
        )
        self._uow.reviews.add(review)
        await self._uow.flush()
        return ReviewCreated(id=review.id, status="pending")


class FavoriteService:
    def __init__(self, uow: UnitOfWork, catalog: TourCatalogService) -> None:
        self._uow = uow
        self._catalog = catalog

    async def list_mine(self, user_id: str) -> list[FavoriteOut]:
        favorites = await self._uow.favorites.for_user(user_id)
        return [
            FavoriteOut(added_at=item.created_at, tour=self._catalog.to_card(item.tour))
            for item in favorites
            # Снятую с публикации экскурсию не показываем, но из избранного
            # не удаляем: её могут вернуть, и список не должен худеть молча.
            if item.tour is not None and item.tour.is_published
        ]

    async def add(self, user_id: str, tour_id: str) -> None:
        tour = await self._uow.tours.find_one(Tour.id == tour_id, Tour.status == "published")
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")
        # Повторное добавление — не ошибка: сердечко могли нажать дважды
        # или открыть страницу в двух вкладках.
        if not await self._uow.favorites.exists_for(user_id, tour_id):
            self._uow.favorites.add(Favorite(user_id=user_id, tour_id=tour_id))
            await self._uow.flush()

    async def remove(self, user_id: str, tour_id: str) -> None:
        await self._uow.favorites.remove(user_id, tour_id)


class ContactService:
    def __init__(self, uow: UnitOfWork, notifier: Notifier) -> None:
        self._uow = uow
        self._notifier = notifier

    async def submit(self, data: ContactRequestCreate) -> ContactRequestCreated:
        request = ContactRequest(
            name=data.name,
            phone=data.phone,
            email=data.email,
            message=data.message,
        )
        self._uow.requests.add(request)
        await self._uow.flush()

        await self._notifier.notify_admins(
            "admin_new_request",
            {
                "contactName": data.name,
                "contactPhone": data.phone,
                "contactEmail": data.email,
                "message": data.message,
            },
        )
        return ContactRequestCreated(id=request.id)
