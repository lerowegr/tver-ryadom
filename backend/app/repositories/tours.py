"""Репозитории каталога: экскурсии, бейджи, расписание, отзывы."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.domain.models.tours import Badge, RoutePoint, Schedule, Tour, TourBadge
from app.domain.schemas.tours import TourFilter, TourSort
from app.repositories.base import Repository

#: Порядок выдачи каталога.
_ORDER_BY: dict[TourSort, tuple[Any, ...]] = {
    TourSort.POPULAR: (Tour.sort_order.asc(), Tour.rating_count.desc()),
    TourSort.PRICE_ASC: (Tour.price.asc(),),
    TourSort.PRICE_DESC: (Tour.price.desc(),),
    TourSort.DURATION_ASC: (Tour.duration_minutes.asc(),),
    TourSort.DURATION_DESC: (Tour.duration_minutes.desc(),),
    TourSort.RATING_ASC: (Tour.rating_avg.asc(), Tour.rating_count.asc()),
    TourSort.RATING_DESC: (Tour.rating_avg.desc(), Tour.rating_count.desc()),
}


class TourRepository(Repository[Tour]):
    model = Tour

    async def published_by_slug(self, slug: str) -> Tour | None:
        """Страница экскурсии со всем, что на ней показывается.

        Связи грузятся одним заходом: без этого карточка маршрута и каждая
        фотография тянули бы отдельный запрос, и страница из двадцати точек
        превращалась бы в двадцать обращений к базе.
        """
        query = (
            select(Tour)
            .where(Tour.slug == slug, Tour.status == "published")
            .options(
                selectinload(Tour.images),
                selectinload(Tour.route_points),
                selectinload(Tour.badges),
                selectinload(Tour.schedules),
            )
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def search(self, filter_: TourFilter) -> tuple[list[Tour], int]:
        """Каталог: страница карточек и общее число совпадений."""
        conditions = self._conditions(filter_)

        total = await self.session.scalar(
            select(func.count()).select_from(Tour).where(and_(*conditions))
        )

        query = (
            self._card_query()
            .where(and_(*conditions))
            .order_by(*_ORDER_BY[filter_.sort])
            .limit(filter_.limit)
            .offset(filter_.offset)
        )
        rows = await self.session.execute(query)
        return list(rows.scalars().unique().all()), int(total or 0)

    def _card_query(self) -> Select[tuple[Tour]]:
        return select(Tour).options(
            # Для карточки нужна одна фотография, но лимит внутри selectinload
            # поставить нельзя — берём все и отрезаем первую при сборке.
            selectinload(Tour.images),
            selectinload(Tour.badges),
            selectinload(Tour.route_points).load_only(RoutePoint.title, RoutePoint.sort_order),
        )

    def _conditions(self, filter_: TourFilter) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [Tour.status == "published"]

        if filter_.price_min is not None:
            conditions.append(Tour.price >= filter_.price_min)
        if filter_.price_max is not None:
            conditions.append(Tour.price <= filter_.price_max)
        if filter_.duration_max is not None:
            conditions.append(Tour.duration_minutes <= filter_.duration_max)

        if filter_.search:
            # ilike у PostgreSQL понимает регистр кириллицы; SQLite, на
            # котором идут тесты, приводит регистр только у латиницы. Для
            # прода это и нужно, но тесты на «САВВАТЬЕВО» писать бесполезно.
            #
            # Экранируем символы шаблона: иначе «50%» в запросе превратится
            # в «что угодно» и найдёт всё подряд.
            pattern = "%" + filter_.search.replace("\\", "\\\\").replace("%", r"\%").replace(
                "_", r"\_"
            ) + "%"
            conditions.append(
                or_(
                    Tour.title.ilike(pattern, escape="\\"),
                    Tour.short_description.ilike(pattern, escape="\\"),
                )
            )

        if slugs := filter_.badge_slugs:
            tagged = (
                select(TourBadge.tour_id)
                .join(Badge, Badge.id == TourBadge.badge_id)
                .where(Badge.slug.in_(slugs))
            )
            conditions.append(Tour.id.in_(tagged))

        return conditions


class BadgeRepository(Repository[Badge]):
    model = Badge

    async def all_sorted(self) -> list[Badge]:
        return await self.find_many(order_by=[Badge.label.asc()])

    async def by_slugs(self, slugs: list[str]) -> list[Badge]:
        if not slugs:
            return []
        return await self.find_many(Badge.slug.in_(slugs))


class ScheduleRepository(Repository[Schedule]):
    model = Schedule

    async def upcoming_for_tour(self, tour_id: str) -> list[Schedule]:
        return await self.find_many(
            Schedule.tour_id == tour_id,
            Schedule.status == "open",
            Schedule.starts_at > datetime.now(UTC),
            order_by=[Schedule.starts_at.asc()],
        )

    async def upcoming_everywhere(self, limit: int = 60) -> list[Schedule]:
        """Ближайшие сборные выходы по всем экскурсиям — раздел «Расписание».

        Черновики отсеиваются здесь же: страницы у них нет, и кнопка
        «Записаться» вела бы в никуда.
        """
        query = (
            select(Schedule)
            .join(Tour, Tour.id == Schedule.tour_id)
            .where(
                Schedule.status == "open",
                Schedule.starts_at > datetime.now(UTC),
                Tour.status == "published",
            )
            .order_by(Schedule.starts_at.asc())
            .limit(limit)
            .options(
                selectinload(Schedule.tour).selectinload(Tour.images),
                selectinload(Schedule.tour).selectinload(Tour.badges),
                selectinload(Schedule.tour).selectinload(Tour.route_points),
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())
