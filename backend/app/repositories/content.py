"""Репозитории отзывов, избранного и обращений."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.domain.models.content import ContactRequest, Favorite, Review
from app.domain.models.tours import Tour
from app.repositories.base import Repository


class ReviewRepository(Repository[Review]):
    model = Review

    async def approved_for_tour(
        self, tour_id: str, *, limit: int, offset: int
    ) -> tuple[list[Review], int]:
        conditions = [Review.tour_id == tour_id, Review.status == "approved"]
        total = await self.count(*conditions)
        items = await self.find_many(
            *conditions,
            order_by=[Review.created_at.desc()],
            limit=limit,
            offset=offset,
        )
        return items, total

    async def latest(self, limit: int = 6) -> list[Review]:
        """Лента на главной: свежие одобренные отзывы с названием экскурсии."""
        query = (
            select(Review)
            .join(Tour, Tour.id == Review.tour_id)
            .where(Review.status == "approved", Tour.status == "published")
            .order_by(Review.created_at.desc())
            .limit(limit)
            .options(selectinload(Review.tour))
        )
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def recalc_tour_rating(self, tour_id: str) -> None:
        """Пересчёт денормализованного рейтинга.

        Каталог показывает среднее у каждой карточки, и считать его на
        каждый запрос — лишняя работа; вместо этого обновляем при изменении
        состава одобренных отзывов.
        """
        row = await self.session.execute(
            select(func.avg(Review.rating), func.count())
            .select_from(Review)
            .where(Review.tour_id == tour_id, Review.status == "approved")
        )
        average, count = row.one()
        tour = await self.session.get(Tour, tour_id)
        if tour is None:  # pragma: no cover — вызывается после проверки
            return
        tour.rating_count = int(count or 0)
        tour.rating_avg = round(float(average), 1) if count else 0.0

    async def by_user_and_tour(self, user_id: str, tour_id: str) -> Review | None:
        return await self.find_one(Review.user_id == user_id, Review.tour_id == tour_id)


class FavoriteRepository(Repository[Favorite]):
    model = Favorite

    async def for_user(self, user_id: str) -> list[Favorite]:
        """Избранное вместе с карточками экскурсий.

        Архивные и черновики отсеиваются при сборке ответа, а не здесь:
        запись об избранном стоит сохранить — экскурсию могут вернуть.
        """
        query = (
            select(Favorite)
            .where(Favorite.user_id == user_id)
            .order_by(Favorite.created_at.desc())
            .options(
                selectinload(Favorite.tour).selectinload(Tour.images),
                selectinload(Favorite.tour).selectinload(Tour.badges),
                selectinload(Favorite.tour).selectinload(Tour.route_points),
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def exists_for(self, user_id: str, tour_id: str) -> bool:
        found = await self.session.execute(
            select(Favorite.user_id).where(
                Favorite.user_id == user_id, Favorite.tour_id == tour_id
            )
        )
        return found.first() is not None

    async def remove(self, user_id: str, tour_id: str) -> int:
        return await self.delete_where(
            Favorite.user_id == user_id, Favorite.tour_id == tour_id
        )


class ContactRequestRepository(Repository[ContactRequest]):
    model = ContactRequest
