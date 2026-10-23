"""Календарная лента iCalendar."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.core.unit_of_work import UnitOfWork
from app.domain.models.tours import Schedule
from app.domain.schemas.admin import CalendarEntry, CalendarGuest
from app.services.calendar import FeedTokenService, IcsBuilder, escape_text, fold
from tests.factories import CatalogFixture


@pytest.fixture
async def admin_headers(client: AsyncClient, user_factory) -> dict[str, str]:
    await user_factory(email="admin@tver-ryadom.ru", role="admin", name="Елена")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@tver-ryadom.ru", "password": "Пароль-12345"},
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


def slot_entry(**kwargs) -> CalendarEntry:
    defaults = dict(
        id="slot-1",
        kind="slot",
        tour_id="tour-1",
        tour_title="Живые истории старого города",
        starts_at=datetime(2026, 11, 3, 8, 0, tzinfo=UTC),
        duration_minutes=120,
        status="open",
        capacity=5,
        booked=2,
        guests=[],
    )
    defaults.update(kwargs)
    return CalendarEntry(**defaults)  # type: ignore[arg-type]


class TestFolding:
    def test_short_line_untouched(self) -> None:
        assert fold("SUMMARY:Коротко") == "SUMMARY:Коротко"

    def test_counts_bytes_not_characters(self) -> None:
        # Сорок кириллических букв — это восемьдесят байт: по символам
        # строка «короткая», по стандарту уже длинная.
        line = "SUMMARY:" + "я" * 40
        folded = fold(line)
        assert "\r\n" in folded
        for part in folded.split("\r\n"):
            assert len(part.encode("utf-8")) <= 75

    def test_never_splits_a_letter(self) -> None:
        folded = fold("DESCRIPTION:" + "ё" * 120)
        # Если бы резали по байтам вслепую, буква порвалась бы пополам
        # и строка перестала бы декодироваться.
        for part in folded.split("\r\n"):
            part.encode("utf-8").decode("utf-8")
        assert "".join(p.lstrip(" ") if i else p for i, p in enumerate(folded.split("\r\n")))

    def test_continuation_starts_with_space(self) -> None:
        parts = fold("SUMMARY:" + "я" * 60).split("\r\n")
        assert all(part.startswith(" ") for part in parts[1:])


class TestEscaping:
    def test_escapes_special_characters(self) -> None:
        assert escape_text("а;б,в\\г") == "а\\;б\\,в\\\\г"

    def test_newline_becomes_literal(self) -> None:
        assert escape_text("строка\nвторая") == "строка\\nвторая"


class TestIcsBuilder:
    def test_structure_and_crlf(self) -> None:
        body = IcsBuilder("https://tver-ryadom.ru").build([slot_entry()])

        assert body.startswith("BEGIN:VCALENDAR\r\n")
        assert body.endswith("END:VCALENDAR\r\n")
        # Стандарт требует CRLF; одиночных переводов строки быть не должно.
        assert "\n" not in body.replace("\r\n", "")
        assert "X-WR-TIMEZONE:Europe/Moscow" in body

    def test_slot_event(self) -> None:
        entry = slot_entry(
            guests=[
                CalendarGuest(
                    name="Мария", phone="+79001112233", people=2, status="confirmed"
                )
            ],
            meeting_point="Соборная площадь",
        )
        body = IcsBuilder("https://tver-ryadom.ru").build([entry])

        assert "UID:slot-slot-1@tver-ryadom" in body
        assert "DTSTART:20261103T080000Z" in body
        # Два часа экскурсии.
        assert "DTEND:20261103T100000Z" in body
        assert "STATUS:CONFIRMED" in body
        assert "Мария" in body.replace("\r\n ", "")
        assert "LOCATION:" in body

    def test_empty_slot_says_so(self) -> None:
        body = IcsBuilder("https://tver-ryadom.ru").build([slot_entry()])
        assert "Записей пока нет" in body.replace("\r\n ", "")

    def test_cancelled_slot(self) -> None:
        body = IcsBuilder("https://tver-ryadom.ru").build([slot_entry(status="cancelled")])
        assert "STATUS:CANCELLED" in body

    def test_request_event_is_tentative(self) -> None:
        entry = CalendarEntry(
            id="booking-1",
            kind="request",
            tour_id="tour-1",
            tour_title="Обзорная",
            starts_at=datetime(2026, 11, 5, 9, 0, tzinfo=UTC),
            duration_minutes=120,
            status="pending",
            people=3,
            contact_name="Мария",
            contact_phone="+79001112233",
        )
        body = IcsBuilder("https://tver-ryadom.ru").build([entry])
        # Заявка ещё не подтверждена — в календаре она «под вопросом».
        assert "STATUS:TENTATIVE" in body
        assert "Заявка:" in body.replace("\r\n ", "")

    def test_long_russian_title_stays_valid(self) -> None:
        entry = slot_entry(tour_title="Экскурсия " * 12)
        body = IcsBuilder("https://tver-ryadom.ru").build([entry])
        for line in body.split("\r\n"):
            assert len(line.encode("utf-8")) <= 75


class TestFeedToken:
    async def test_created_once_and_kept(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            service = FeedTokenService(uow)
            first = await service.ensure()
            await uow.commit()

        async with UnitOfWork(database.session_factory) as uow:
            again = await FeedTokenService(uow).ensure()
        assert first == again
        assert len(first) == 48

    async def test_rotation_changes_it(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            service = FeedTokenService(uow)
            first = await service.ensure()
            await uow.commit()
        async with UnitOfWork(database.session_factory) as uow:
            second = await FeedTokenService(uow).rotate()
            await uow.commit()
        assert first != second


class TestFeedEndpoint:
    async def test_serves_calendar_by_secret_link(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        link = await client.get("/api/v1/admin/calendar/feed", headers=admin_headers)
        token = link.json()["data"]["token"]
        assert link.json()["data"]["url"].endswith(f"/calendar/{token}.ics")

        response = await client.get(f"/calendar/{token}.ics")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/calendar")
        assert response.text.startswith("BEGIN:VCALENDAR")

    async def test_slot_appears_in_feed(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            slot = (
                await session.execute(
                    select(Schedule).where(
                        Schedule.tour_id == catalog.obzornaya,
                        Schedule.starts_at > datetime.now(UTC),
                        Schedule.status == "open",
                    )
                )
            ).scalars().first()

        token = (
            await client.get("/api/v1/admin/calendar/feed", headers=admin_headers)
        ).json()["data"]["token"]
        body = (await client.get(f"/calendar/{token}.ics")).text

        assert f"UID:slot-{slot.id}@tver-ryadom" in body

    async def test_wrong_token_is_not_found(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await client.get("/api/v1/admin/calendar/feed", headers=admin_headers)
        response = await client.get("/calendar/не-тот-токен.ics")
        assert response.status_code == 404

    async def test_no_token_configured(self, client: AsyncClient) -> None:
        # Лента не заведена — любой адрес должен отвечать «не найдено».
        assert (await client.get("/calendar/что-угодно.ics")).status_code == 404

    async def test_rotation_kills_the_old_link(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        old = (
            await client.get("/api/v1/admin/calendar/feed", headers=admin_headers)
        ).json()["data"]["token"]
        await client.post("/api/v1/admin/calendar/feed/rotate", headers=admin_headers)

        # Ссылка и есть пароль: после смены старая работать не должна.
        assert (await client.get(f"/calendar/{old}.ics")).status_code == 404

    async def test_feed_needs_admin(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/admin/calendar/feed")).status_code == 401

    async def test_window_covers_past_month(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            session.add(
                Schedule(
                    tour_id=catalog.obzornaya,
                    starts_at=datetime.now(UTC) - timedelta(days=10),
                    capacity=5,
                    status="open",
                )
            )
            await session.commit()

        token = (
            await client.get("/api/v1/admin/calendar/feed", headers=admin_headers)
        ).json()["data"]["token"]
        body = (await client.get(f"/calendar/{token}.ics")).text
        # Прошедшие выходы нужны, чтобы в календаре осталась история.
        assert body.count("BEGIN:VEVENT") >= 3
