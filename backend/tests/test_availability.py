"""Занятость экскурсовода и переходы статусов брони."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.core.database import Database
from app.core.errors import ConflictError, ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.availability import AvailabilityBlock
from app.domain.schemas.availability import AvailabilityBlockCreate
from app.services.availability import AvailabilityService, to_msk_wall_clock
from app.services.bookings import BookingService, format_price
from app.services.notifications import NullNotifier
from tests.factories import CatalogFixture


def msk(iso: str) -> datetime:
    """Момент по московскому времени."""
    return datetime.fromisoformat(f"{iso}+03:00")


class TestWallClock:
    def test_evening_utc_is_next_day_in_tver(self) -> None:
        # 21:30 UTC — уже следующие сутки в Твери, и закрытие дня должно
        # считать именно так.
        wall = to_msk_wall_clock(datetime(2026, 11, 3, 21, 30, tzinfo=UTC))
        assert wall.date == "2026-11-04"
        assert wall.time == "00:30"

    def test_minutes_from_midnight(self) -> None:
        assert to_msk_wall_clock(msk("2026-11-03T14:30")).minutes == 14 * 60 + 30


class TestIsBlocked:
    async def _service(self, database: Database) -> tuple[AvailabilityService, UnitOfWork]:
        uow = UnitOfWork(database.session_factory)
        await uow.__aenter__()
        return AvailabilityService(uow), uow

    async def test_whole_day_covers_morning_and_evening(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            uow.availability.add(AvailabilityBlock(date="2026-11-03", note="отпуск"))
            await uow.flush()

            assert await service.is_blocked(msk("2026-11-03T09:00"), 120) is True
            assert await service.is_blocked(msk("2026-11-03T20:00"), 120) is True
            # Закрытие не растекается за край суток.
            assert await service.is_blocked(msk("2026-11-02T20:00"), 120) is False
            assert await service.is_blocked(msk("2026-11-04T09:00"), 120) is False
        finally:
            await uow.__aexit__(None, None, None)

    async def test_overlapping_excursion_is_rejected(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            uow.availability.add(
                AvailabilityBlock(
                    date="2026-11-05",
                    start_time="15:00",
                    end_time="17:00",
                    note="экскурсия со Спутника",
                )
            )
            await uow.flush()

            # Начало свободно, но двухчасовая прогулка дотягивается до 15:00.
            assert await service.is_blocked(msk("2026-11-05T14:00"), 120) is True
            # Часовая заканчивается ровно к началу занятого и проходит.
            assert await service.is_blocked(msk("2026-11-05T14:00"), 60) is False
            assert await service.is_blocked(msk("2026-11-05T17:00"), 120) is False
        finally:
            await uow.__aexit__(None, None, None)

    async def test_excursion_crossing_midnight(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            uow.availability.add(AvailabilityBlock(date="2026-11-06", note="отпуск"))
            await uow.flush()

            # Поздний выезд пятого числа заходит в закрытое шестое.
            assert await service.is_blocked(msk("2026-11-05T23:00"), 180) is True
        finally:
            await uow.__aexit__(None, None, None)


class TestClosingPeriods:
    async def _service(self, database: Database) -> tuple[AvailabilityService, UnitOfWork]:
        uow = UnitOfWork(database.session_factory)
        await uow.__aenter__()
        return AvailabilityService(uow), uow

    async def test_period_becomes_one_row_per_day(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            blocks = await service.close(
                AvailabilityBlockCreate.model_validate(
                    {"from": "2026-12-01", "to": "2026-12-05", "note": "отпуск"}
                )
            )
            # Пять дней — пять строк: так период открывается обратно по дням.
            assert [block.date for block in blocks] == [
                "2026-12-01",
                "2026-12-02",
                "2026-12-03",
                "2026-12-04",
                "2026-12-05",
            ]
            assert all(block.start_time is None for block in blocks)
        finally:
            await uow.__aexit__(None, None, None)

    async def test_open_day_clears_everything_on_that_date(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            await service.close(
                AvailabilityBlockCreate.model_validate(
                    {"from": "2026-12-01", "to": "2026-12-01", "startTime": "10:00",
                     "endTime": "12:00"}
                )
            )
            await service.close(
                AvailabilityBlockCreate.model_validate(
                    {"from": "2026-12-01", "to": "2026-12-01", "startTime": "15:00",
                     "endTime": "17:00"}
                )
            )
            await uow.flush()
            assert len(await service.list_admin("2026-12-01", "2026-12-01")) == 2

            await service.open_day("2026-12-01")
            assert await service.list_admin("2026-12-01", "2026-12-01") == []
        finally:
            await uow.__aexit__(None, None, None)

    async def test_refuses_absurd_period(self, database: Database) -> None:
        service, uow = await self._service(database)
        try:
            with pytest.raises(ValidationError):
                await service.close(
                    AvailabilityBlockCreate.model_validate(
                        {"from": "2026-01-01", "to": "2027-12-31"}
                    )
                )
        finally:
            await uow.__aexit__(None, None, None)


class TestAvailabilitySchema:
    @pytest.mark.parametrize(
        "payload",
        [
            {"from": "2026-12-05", "to": "2026-12-01"},
            {"from": "2026-12-01", "to": "2026-12-01", "startTime": "10:00"},
            {"from": "2026-12-01", "to": "2026-12-01", "startTime": "17:00", "endTime": "15:00"},
            {"from": "2026-12-01", "to": "2026-12-01", "startTime": "25:00", "endTime": "26:00"},
        ],
    )
    def test_rejects_broken_input(self, payload: dict) -> None:
        with pytest.raises(ValueError):
            AvailabilityBlockCreate.model_validate(payload)


class TestPublicEndpoint:
    async def test_hides_notes(self, client: AsyncClient, database: Database) -> None:
        async with database.session() as session:
            session.add(AvailabilityBlock(date="2026-12-01", note="личное"))
            await session.commit()

        response = await client.get("/api/v1/availability?from=2026-12-01&to=2026-12-31")
        assert response.status_code == 200
        # Заметка — для себя, гостям её видеть незачем.
        assert response.json()["data"]["blocks"] == [
            {"date": "2026-12-01", "startTime": None, "endTime": None}
        ]

    async def test_rejects_broken_range(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/availability?from=2026-12-05&to=2026-12-01")
        assert response.status_code == 422

    async def test_rejects_broken_date_format(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/availability?from=01.12.2026&to=2026-12-31")
        assert response.status_code == 422


class TestStatusTransitions:
    async def _book(self, client: AsyncClient, catalog: CatalogFixture) -> str:
        from datetime import timedelta

        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Гость",
                "contactPhone": "8 900 111-22-33",
            },
        )
        return response.json()["data"]["id"]

    async def _service(self, database: Database) -> tuple[BookingService, UnitOfWork]:
        uow = UnitOfWork(database.session_factory)
        await uow.__aenter__()
        service = BookingService(uow, AvailabilityService(uow), NullNotifier())
        return service, uow

    async def test_allowed_path(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        booking_id = await self._book(client, catalog)
        service, uow = await self._service(database)
        try:
            booking = await service.change_status(booking_id, "confirmed")
            assert booking.status == "confirmed"
            booking = await service.change_status(booking_id, "completed")
            assert booking.status == "completed"
            await uow.commit()
        finally:
            await uow.__aexit__(None, None, None)

    async def test_finished_booking_is_final(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        booking_id = await self._book(client, catalog)
        service, uow = await self._service(database)
        try:
            await service.change_status(booking_id, "completed")
            # Из завершённой уже никуда: это конец истории.
            with pytest.raises(ConflictError):
                await service.change_status(booking_id, "confirmed")
        finally:
            await uow.__aexit__(None, None, None)

    async def test_repeating_same_status_is_not_an_error(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        booking_id = await self._book(client, catalog)
        service, uow = await self._service(database)
        try:
            await service.change_status(booking_id, "confirmed")
            # Админка могла нажать дважды — это не повод ругаться,
            # но комментарий всё равно сохраняется.
            booking = await service.change_status(booking_id, "confirmed", "перезвонила")
            assert booking.admin_comment == "перезвонила"
        finally:
            await uow.__aexit__(None, None, None)


class TestPriceFormatting:
    def test_matches_old_format(self) -> None:
        # «4 500 ₽» с неразрывными пробелами — как в прежних шаблонах писем.
        assert format_price(450000) == "4 500 ₽"
        assert format_price(120000) == "1 200 ₽"
