"""Единица работы.

Держит сессию базы и набор репозиториев вокруг неё, а главное — границу
транзакции. Сервис говорит `await uow.commit()` один раз в конце операции,
и либо записывается всё, либо ничего.

На Workers такой границы не было: D1 не поддерживает интерактивные
транзакции, и, например, создание брони шло двумя отдельными запросами —
счётчик мест и сама запись. Между ними воркер мог упасть и оставить
занятое место без брони. Здесь это одна транзакция.

Репозитории создаются лениво: операции, которым нужен один пользователь,
не должны тянуть за собой десяток объектов.
"""

from __future__ import annotations

from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.availability import AvailabilityRepository
from app.repositories.bookings import BookingRepository
from app.repositories.content import (
    ContactRequestRepository,
    FavoriteRepository,
    ReviewRepository,
)
from app.repositories.tours import BadgeRepository, ScheduleRepository, TourRepository
from app.repositories.users import SessionRepository, UserRepository


class UnitOfWork:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._users: UserRepository | None = None
        self._sessions: SessionRepository | None = None
        self._tours: TourRepository | None = None
        self._badges: BadgeRepository | None = None
        self._schedules: ScheduleRepository | None = None
        self._reviews: ReviewRepository | None = None
        self._availability: AvailabilityRepository | None = None
        self._bookings: BookingRepository | None = None
        self._favorites: FavoriteRepository | None = None
        self._requests: ContactRequestRepository | None = None

    # ---- Протокол контекстного менеджера --------------------------------

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            # Незавершённую работу откатываем всегда: без явного commit
            # ничего не должно просочиться в базу, даже если исключения нет.
            if exc_type is not None:
                await self.rollback()
        finally:
            if self._session is not None:
                await self._session.close()
                self._session = None
                self._users = None
                self._sessions = None
                self._tours = None
                self._badges = None
                self._schedules = None
                self._reviews = None
                self._availability = None
                self._bookings = None
                self._favorites = None
                self._requests = None

    # ---- Транзакция ------------------------------------------------------

    @property
    def session(self) -> AsyncSession:
        if self._session is None:
            raise RuntimeError("Единица работы используется вне контекста `async with`")
        return self._session

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

    async def flush(self) -> None:
        """Отправить изменения в базу, не закрывая транзакцию, — нужно,
        когда дальше по ходу операции требуется сгенерированное значение."""
        await self.session.flush()

    # ---- Репозитории -----------------------------------------------------

    @property
    def users(self) -> UserRepository:
        if self._users is None:
            self._users = UserRepository(self.session)
        return self._users

    @property
    def sessions(self) -> SessionRepository:
        if self._sessions is None:
            self._sessions = SessionRepository(self.session)
        return self._sessions

    @property
    def tours(self) -> TourRepository:
        if self._tours is None:
            self._tours = TourRepository(self.session)
        return self._tours

    @property
    def badges(self) -> BadgeRepository:
        if self._badges is None:
            self._badges = BadgeRepository(self.session)
        return self._badges

    @property
    def schedules(self) -> ScheduleRepository:
        if self._schedules is None:
            self._schedules = ScheduleRepository(self.session)
        return self._schedules

    @property
    def reviews(self) -> ReviewRepository:
        if self._reviews is None:
            self._reviews = ReviewRepository(self.session)
        return self._reviews

    @property
    def availability(self) -> AvailabilityRepository:
        if self._availability is None:
            self._availability = AvailabilityRepository(self.session)
        return self._availability

    @property
    def bookings(self) -> BookingRepository:
        if self._bookings is None:
            self._bookings = BookingRepository(self.session)
        return self._bookings

    @property
    def favorites(self) -> FavoriteRepository:
        if self._favorites is None:
            self._favorites = FavoriteRepository(self.session)
        return self._favorites

    @property
    def requests(self) -> ContactRequestRepository:
        if self._requests is None:
            self._requests = ContactRequestRepository(self.session)
        return self._requests
