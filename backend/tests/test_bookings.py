"""Бронирование: заявки, места в слотах, отмена, статусы."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.domain.models.bookings import Booking
from app.domain.models.tours import Schedule, Tour
from tests.factories import CatalogFixture

GUEST = {"contactName": "Гость", "contactPhone": "8 900 111-22-33"}


async def first_open_slot(database: Database, tour_id: str) -> Schedule:
    async with database.session() as session:
        result = await session.execute(
            select(Schedule)
            .where(
                Schedule.tour_id == tour_id,
                Schedule.status == "open",
                Schedule.starts_at > datetime.now(UTC),
            )
            .order_by(Schedule.starts_at)
        )
        return result.scalars().first()  # type: ignore[return-value]


def in_days(days: int, hour: int = 12) -> str:
    """Момент в будущем по московскому времени."""
    moment = datetime.now(UTC) + timedelta(days=days)
    return moment.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


class TestCreateBooking:
    async def test_guest_can_book_a_slot(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        slot = await first_open_slot(database, catalog.obzornaya)
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 2,
                **GUEST,
            },
        )
        assert response.status_code == 201
        data = response.json()["data"]

        assert data["status"] == "pending"
        # Цена за группу не зависит от числа участников.
        assert data["totalPrice"] == 450000
        assert data["tour"]["slug"] == "obzornaya-po-tveri"

    async def test_per_person_price_multiplies(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            tour = await session.get(Tour, catalog.predmeste)
            tour.price_type = "per_person"
            tour.price = 120000
            await session.commit()

        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.predmeste,
                "desiredDate": in_days(10),
                "peopleCount": 3,
                **GUEST,
            },
        )
        assert response.json()["data"]["totalPrice"] == 360000

    async def test_normalizes_phone(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                "contactName": "Гость",
                "contactPhone": "8 (900) 111-22-33",
            },
        )
        async with database.session() as session:
            booking = (await session.execute(select(Booking))).scalars().first()
            # «8 910» и «+7 910» не должны оказаться разными людьми.
            assert booking.contact_phone == "+79001112233"

    async def test_rejects_bad_phone(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                "contactName": "Гость",
                "contactPhone": "12345",
            },
        )
        assert response.status_code == 422

    async def test_requires_a_date(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.post(
            "/api/v1/bookings",
            json={"tourId": catalog.obzornaya, "peopleCount": 2, **GUEST},
        )
        assert response.status_code == 422

    async def test_rejects_past_date(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(-5),
                "peopleCount": 2,
                **GUEST,
            },
        )
        assert response.status_code == 422

    async def test_respects_group_limits(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 9,
                **GUEST,
            },
        )
        assert response.status_code == 422
        assert "Максимальный размер группы" in response.json()["error"]["message"]

    async def test_draft_tour_cannot_be_booked(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.draft,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                **GUEST,
            },
        )
        assert response.status_code == 404


class TestSeats:
    async def test_seats_are_taken(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        slot = await first_open_slot(database, catalog.obzornaya)
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 2,
                **GUEST,
            },
        )
        async with database.session() as session:
            fresh = await session.get(Schedule, slot.id)
            # Было занято 2 из 5, стало 4.
            assert fresh.booked_count == 4
            assert fresh.free_seats == 1

    async def test_rejects_when_not_enough_seats(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        slot = await first_open_slot(database, catalog.obzornaya)
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 4,  # свободно только 3
                **GUEST,
            },
        )
        assert response.status_code == 409
        assert "недостаточно свободных мест" in response.json()["error"]["message"]

    async def test_reserve_guard_rejects_overbooking(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        """Условие вместимости живёт в самом UPDATE.

        Настоящую одновременность здесь не проверить: тесты идут на SQLite
        с одним общим соединением, где параллельных транзакций попросту не
        бывает, а откат одной сносит работу другой. Поэтому проверяется сам
        механизм — что UPDATE не записывается, когда мест не хватает.
        От гонки на проде защищает блокировка строки в PostgreSQL: вторая
        транзакция перечитывает счётчик уже после первой.
        """
        from app.repositories.bookings import BookingRepository

        slot = await first_open_slot(database, catalog.obzornaya)
        async with database.session() as session:
            repository = BookingRepository(session)

            # Свободно три места: двое проходят.
            assert await repository.reserve_seats(slot.id, 2) is True
            await session.commit()

            # Ещё двое уже не помещаются, и счётчик не сдвигается.
            assert await repository.reserve_seats(slot.id, 2) is False
            await session.commit()

            fresh = await session.get(Schedule, slot.id)
            await session.refresh(fresh)
            assert fresh.booked_count == 4
            assert fresh.booked_count <= fresh.capacity

    async def test_release_never_goes_negative(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        from app.repositories.bookings import BookingRepository

        slot = await first_open_slot(database, catalog.obzornaya)
        async with database.session() as session:
            repository = BookingRepository(session)
            # Возврат мест больше, чем занято: отрицательный счётчик
            # выглядел бы как «свободно больше, чем вмещается».
            await repository.release_seats(slot.id, 99)
            await session.commit()
            fresh = await session.get(Schedule, slot.id)
            await session.refresh(fresh)
            assert fresh.booked_count == 0

    async def test_closed_slot_is_not_found(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            closed = (
                await session.execute(
                    select(Schedule).where(
                        Schedule.tour_id == catalog.obzornaya, Schedule.status == "closed"
                    )
                )
            ).scalars().first()

        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": closed.id,
                "peopleCount": 1,
                **GUEST,
            },
        )
        assert response.status_code == 404


class TestAvailabilityBlocksBooking:
    async def _close_day(self, client: AsyncClient, database: Database, date: str) -> None:
        from app.domain.models.availability import AvailabilityBlock

        async with database.session() as session:
            session.add(AvailabilityBlock(date=date, note="отпуск"))
            await session.commit()

    async def test_closed_day_rejects_own_date(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        moment = datetime.now(UTC) + timedelta(days=14)
        from app.services.availability import to_msk_wall_clock

        day = to_msk_wall_clock(moment).date
        await self._close_day(client, database, day)

        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": f"{day}T12:00:00+03:00",
                "peopleCount": 2,
                **GUEST,
            },
        )
        assert response.status_code == 409
        assert "экскурсовод занят" in response.json()["error"]["message"]

    async def test_neighbouring_day_still_works(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        from app.services.availability import to_msk_wall_clock

        closed = to_msk_wall_clock(datetime.now(UTC) + timedelta(days=14)).date
        free = to_msk_wall_clock(datetime.now(UTC) + timedelta(days=15)).date
        await self._close_day(client, database, closed)

        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": f"{free}T12:00:00+03:00",
                "peopleCount": 2,
                **GUEST,
            },
        )
        assert response.status_code == 201

    async def test_slot_booking_ignores_blocks(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        """Слот расписания Елена ставит сама, поэтому закрытие дня его
        не отменяет: иначе собственный выход блокировал бы себя."""
        from app.services.availability import to_msk_wall_clock

        slot = await first_open_slot(database, catalog.obzornaya)
        await self._close_day(client, database, to_msk_wall_clock(slot.starts_at).date)

        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 1,
                **GUEST,
            },
        )
        assert response.status_code == 201


class TestMyBookings:
    async def _register(self, client: AsyncClient) -> str:
        response = await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        return response.json()["data"]["accessToken"]

    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/bookings/my")).status_code == 401

    async def test_lists_own_bookings(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await self._register(client)
        headers = {"Authorization": f"Bearer {token}"}

        await client.post(
            "/api/v1/bookings",
            headers=headers,
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                **GUEST,
            },
        )
        response = await client.get("/api/v1/bookings/my", headers=headers)
        data = response.json()["data"]

        assert data["total"] == 1
        booking = data["items"][0]
        assert booking["tour"]["slug"] == "obzornaya-po-tveri"
        assert booking["peopleCount"] == 2
        assert booking["startsAt"] is not None

    async def test_does_not_leak_other_peoples_bookings(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        # Гостевая заявка без аккаунта.
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                **GUEST,
            },
        )
        token = await self._register(client)
        response = await client.get(
            "/api/v1/bookings/my", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.json()["data"]["total"] == 0


class TestCancel:
    async def _book_as_user(self, client: AsyncClient, catalog: CatalogFixture) -> tuple[str, str]:
        token = (
            await client.post(
                "/api/v1/auth/register",
                json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
            )
        ).json()["data"]["accessToken"]
        booking = await client.post(
            "/api/v1/bookings",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": in_days(10),
                "peopleCount": 2,
                **GUEST,
            },
        )
        return token, booking.json()["data"]["id"]

    async def test_cancels_own_booking(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token, booking_id = await self._book_as_user(client, catalog)
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.post(
            f"/api/v1/bookings/{booking_id}/cancel",
            headers=headers,
            json={"reason": "Планы изменились"},
        )
        assert response.status_code == 200

        listing = await client.get("/api/v1/bookings/my", headers=headers)
        assert listing.json()["data"]["items"][0]["status"] == "cancelled"

    async def test_cannot_cancel_twice(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token, booking_id = await self._book_as_user(client, catalog)
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=headers, json={})

        again = await client.post(
            f"/api/v1/bookings/{booking_id}/cancel", headers=headers, json={}
        )
        assert again.status_code == 409

    async def test_cannot_cancel_someone_elses(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        _, booking_id = await self._book_as_user(client, catalog)
        stranger = (
            await client.post(
                "/api/v1/auth/register",
                json={"name": "Чужой", "email": "other@example.com", "password": "Пароль-12345"},
            )
        ).json()["data"]["accessToken"]

        response = await client.post(
            f"/api/v1/bookings/{booking_id}/cancel",
            headers={"Authorization": f"Bearer {stranger}"},
            json={},
        )
        # Именно 404: 403 подтвердил бы, что такая бронь существует.
        assert response.status_code == 404

    async def test_cancel_returns_seats(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        slot = await first_open_slot(database, catalog.obzornaya)
        token = (
            await client.post(
                "/api/v1/auth/register",
                json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
            )
        ).json()["data"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        booking = await client.post(
            "/api/v1/bookings",
            headers=headers,
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 2,
                **GUEST,
            },
        )
        await client.post(
            f"/api/v1/bookings/{booking.json()['data']['id']}/cancel",
            headers=headers,
            json={},
        )
        async with database.session() as session:
            fresh = await session.get(Schedule, slot.id)
            # Два места вернулись: было 2, стало 4, снова 2.
            assert fresh.booked_count == 2
