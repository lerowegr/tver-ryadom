"""Административная панель."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.core.errors import ConflictError
from app.domain.models.auth import Session, User
from app.domain.models.content import Review
from app.domain.models.tours import Schedule
from tests.factories import CatalogFixture


@pytest.fixture
async def admin_headers(client: AsyncClient, user_factory) -> dict[str, str]:
    await user_factory(email="admin@tver-ryadom.ru", role="admin", name="Елена")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@tver-ryadom.ru", "password": "Пароль-12345"},
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


@pytest.fixture
async def user_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Гость", "email": "guest@example.com", "password": "Пароль-12345"},
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


class TestAccess:
    @pytest.mark.parametrize(
        "path",
        ["/api/v1/admin/stats", "/api/v1/admin/tours", "/api/v1/admin/bookings",
         "/api/v1/admin/users", "/api/v1/admin/settings"],
    )
    async def test_guest_is_rejected(self, client: AsyncClient, path: str) -> None:
        assert (await client.get(path)).status_code == 401

    @pytest.mark.parametrize(
        "path",
        ["/api/v1/admin/stats", "/api/v1/admin/tours", "/api/v1/admin/bookings",
         "/api/v1/admin/users", "/api/v1/admin/settings"],
    )
    async def test_ordinary_user_is_forbidden(
        self, client: AsyncClient, user_headers: dict[str, str], path: str
    ) -> None:
        # Обычный вошедший — не администратор, и панель ему недоступна.
        assert (await client.get(path, headers=user_headers)).status_code == 403


class TestTourManagement:
    async def test_lists_drafts_too(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/admin/tours", headers=admin_headers)
        slugs = {item["slug"] for item in response.json()["data"]["items"]}
        # В отличие от витрины, панель показывает и черновики.
        assert "chernovik" in slugs

    async def test_opens_draft_by_id(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.get(
            f"/api/v1/admin/tours/{catalog.draft}", headers=admin_headers
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "draft"

    async def test_creates_tour_with_badges_and_route(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/admin/tours",
            headers=admin_headers,
            json={
                "slug": "novaya-ekskursiya",
                "title": "Новая экскурсия по Твери",
                "shortDescription": "Короткое описание новой экскурсии.",
                "fullDescription": "Полное описание новой экскурсии по Твери.",
                "price": 500000,
                "priceType": "per_group",
                "durationMinutes": 90,
                "badgeSlugs": ["hit", "walking"],
                "routePoints": [
                    {"title": "Вторая точка", "lat": 56.86, "lng": 35.90},
                    {"title": "Первая точка", "lat": 56.85, "lng": 35.91},
                ],
                "status": "published",
            },
        )
        assert response.status_code == 201
        data = response.json()["data"]

        assert {badge["slug"] for badge in data["badges"]} == {"hit", "walking"}
        # Порядок точек задаётся порядком в запросе, а не сортировкой.
        assert [point["title"] for point in data["routePoints"]] == [
            "Вторая точка",
            "Первая точка",
        ]

    async def test_rejects_duplicate_slug(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/admin/tours",
            headers=admin_headers,
            json={
                "slug": "obzornaya-po-tveri",
                "title": "Ещё одна обзорная",
                "shortDescription": "Короткое описание.",
                "fullDescription": "Полное описание экскурсии.",
                "price": 100000,
                "durationMinutes": 60,
            },
        )
        assert response.status_code == 409

    async def test_rejects_unknown_badge(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/admin/tours",
            headers=admin_headers,
            json={
                "slug": "ещё-одна",
                "title": "Ещё одна экскурсия",
                "shortDescription": "Короткое описание.",
                "fullDescription": "Полное описание экскурсии.",
                "price": 100000,
                "durationMinutes": 60,
                "badgeSlugs": ["такого-нет"],
            },
        )
        # Слаг кириллицей тоже не проходит — он попадает в адрес страницы.
        assert response.status_code == 422

    async def test_partial_update_keeps_the_rest(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        before = (
            await client.get(f"/api/v1/admin/tours/{catalog.obzornaya}", headers=admin_headers)
        ).json()["data"]

        response = await client.patch(
            f"/api/v1/admin/tours/{catalog.obzornaya}",
            headers=admin_headers,
            json={"price": 480000},
        )
        after = response.json()["data"]

        assert after["price"] == 480000
        assert after["title"] == before["title"]
        assert after["fullDescription"] == before["fullDescription"]
        assert len(after["badges"]) == len(before["badges"])

    async def test_archives_instead_of_deleting(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.delete(
            f"/api/v1/admin/tours/{catalog.predmeste}", headers=admin_headers
        )
        assert response.status_code == 200

        # Запись цела, просто ушла из витрины: история броней должна жить.
        detail = await client.get(
            f"/api/v1/admin/tours/{catalog.predmeste}", headers=admin_headers
        )
        assert detail.json()["data"]["status"] == "archived"
        assert (await client.get("/api/v1/tours/predmeste-tveri")).status_code == 404

    async def test_refuses_to_archive_with_active_bookings(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Гость",
                "contactPhone": "8 900 111-22-33",
            },
        )
        response = await client.delete(
            f"/api/v1/admin/tours/{catalog.obzornaya}", headers=admin_headers
        )
        assert response.status_code == 409
        assert "активные брони" in response.json()["error"]["message"]


class TestScheduleManagement:
    async def test_creates_slot(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        starts = (datetime.now(UTC) + timedelta(days=30)).replace(microsecond=0)
        response = await client.post(
            "/api/v1/admin/schedules",
            headers=admin_headers,
            json={"tourId": catalog.obzornaya, "startsAt": starts.isoformat(), "capacity": 10},
        )
        assert response.status_code == 201

        # Новый слот сразу виден в разделе «Расписание» на сайте.
        schedule = await client.get("/api/v1/schedule")
        assert len(schedule.json()["data"]["items"]) == 3

    async def test_refuses_past_slot(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        past = (datetime.now(UTC) - timedelta(days=1)).replace(microsecond=0)
        response = await client.post(
            "/api/v1/admin/schedules",
            headers=admin_headers,
            json={"tourId": catalog.obzornaya, "startsAt": past.isoformat(), "capacity": 10},
        )
        assert response.status_code == 422

    async def test_cannot_shrink_below_booked(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            slot = (
                await session.execute(
                    select(Schedule).where(
                        Schedule.tour_id == catalog.obzornaya, Schedule.booked_count == 2
                    )
                )
            ).scalars().first()

        response = await client.patch(
            f"/api/v1/admin/schedules/{slot.id}", headers=admin_headers, json={"capacity": 1}
        )
        assert response.status_code == 409

    async def test_slot_with_bookings_is_closed_not_deleted(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            slot = (
                await session.execute(
                    select(Schedule).where(
                        Schedule.tour_id == catalog.obzornaya,
                        Schedule.status == "open",
                        Schedule.starts_at > datetime.now(UTC),
                    )
                )
            ).scalars().first()

        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 1,
                "contactName": "Гость",
                "contactPhone": "8 900 111-22-33",
            },
        )
        response = await client.delete(
            f"/api/v1/admin/schedules/{slot.id}", headers=admin_headers
        )
        # У броней отвалилась бы дата, поэтому слот только закрывается.
        assert response.json()["data"]["cancelled"] is True
        async with database.session() as session:
            assert (await session.get(Schedule, slot.id)) is not None


class TestBookingManagement:
    async def _book(self, client: AsyncClient, catalog: CatalogFixture) -> str:
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        response = await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Мария",
                "contactPhone": "8 900 111-22-33",
            },
        )
        return response.json()["data"]["id"]

    async def test_lists_with_contacts(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        await self._book(client, catalog)
        response = await client.get("/api/v1/admin/bookings", headers=admin_headers)
        booking = response.json()["data"]["items"][0]

        # Админке видно то, чего нет в кабинете гостя.
        assert booking["contactPhone"] == "+79001112233"
        assert booking["source"] == "web"
        assert "adminComment" in booking

    async def test_changes_status(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        booking_id = await self._book(client, catalog)
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking_id}",
            headers=admin_headers,
            json={"status": "confirmed", "adminComment": "Созвонились"},
        )
        assert response.json()["data"]["status"] == "confirmed"

    async def test_refuses_impossible_transition(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        booking_id = await self._book(client, catalog)
        await client.patch(
            f"/api/v1/admin/bookings/{booking_id}",
            headers=admin_headers,
            json={"status": "cancelled"},
        )
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking_id}",
            headers=admin_headers,
            json={"status": "confirmed"},
        )
        assert response.status_code == 409


class TestReviewModeration:
    async def test_approving_updates_rating(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            pending = (
                await session.execute(select(Review).where(Review.status == "pending"))
            ).scalars().one()

        response = await client.patch(
            f"/api/v1/admin/reviews/{pending.id}",
            headers=admin_headers,
            json={"status": "approved"},
        )
        assert response.status_code == 200

        # Отзыв на единицу должен уронить среднее с пятёрки.
        tour = await client.get("/api/v1/tours/obzornaya-po-tveri")
        assert tour.json()["data"]["ratingCount"] == 3
        assert tour.json()["data"]["ratingAvg"] < 5

    async def test_creates_review_with_its_own_date(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/admin/reviews",
            headers=admin_headers,
            json={
                "tourId": catalog.obzornaya,
                "authorName": "Ирина",
                "rating": 5,
                "text": "Прекрасная Елена согрела нас своим гостеприимством.",
                "createdAt": "2026-03-24T12:00:00Z",
            },
        )
        assert response.status_code == 201

        listing = await client.get("/api/v1/tours/obzornaya-po-tveri/reviews")
        dates = [item["createdAt"] for item in listing.json()["data"]["items"]]
        # Перенесённый отзыв встаёт своим числом, а не сегодняшним.
        assert any(date.startswith("2026-03-24") for date in dates)

    async def test_deletes_review_and_recounts(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            approved = (
                await session.execute(select(Review).where(Review.status == "approved"))
            ).scalars().first()

        await client.delete(f"/api/v1/admin/reviews/{approved.id}", headers=admin_headers)
        tour = await client.get("/api/v1/tours/obzornaya-po-tveri")
        assert tour.json()["data"]["ratingCount"] == 1


class TestUserManagement:
    async def test_lists_with_booking_counts(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/admin/users", headers=admin_headers)
        users = response.json()["data"]["items"]
        assert users[0]["bookingsCount"] == 0
        assert all("passwordHash" not in user for user in users)

    async def test_creates_employee(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "email": "pomoshnik@tver-ryadom.ru",
                "name": "Помощник",
                "password": "ДлинныйПароль-123",
                "role": "admin",
            },
        )
        assert response.status_code == 201

        # Заведённый сотрудник может войти.
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "pomoshnik@tver-ryadom.ru", "password": "ДлинныйПароль-123"},
        )
        assert login.status_code == 200

    async def test_short_password_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "email": "pomoshnik@tver-ryadom.ru",
                "name": "Помощник",
                "password": "короткий",
                "role": "admin",
            },
        )
        assert response.status_code == 422

    async def test_cannot_demote_self(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str]
    ) -> None:
        async with database.session() as session:
            me = (
                await session.execute(select(User).where(User.role == "admin"))
            ).scalars().one()

        response = await client.patch(
            f"/api/v1/admin/users/{me.id}/role", headers=admin_headers, json={"role": "user"}
        )
        # Иначе можно закрыть себе доступ в панель.
        assert response.status_code == 409

    async def test_cannot_remove_last_admin(
        self, database: Database, admin_headers: dict[str, str]
    ) -> None:
        """Последнего администратора снять нельзя.

        Через панель до этой проверки не добраться: тот, кто снимает права,
        сам администратор, и раньше сработает запрет снимать их с себя.
        Поэтому служба вызывается напрямую — защита нужна на случай, когда
        права снимает не человек, а скрипт.
        """
        from app.core.security import Pbkdf2PasswordHasher
        from app.core.unit_of_work import UnitOfWork
        from app.services.admin.people import AdminUserService

        async with database.session() as session:
            only_admin = (
                await session.execute(select(User).where(User.role == "admin"))
            ).scalars().one()

        uow = UnitOfWork(database.session_factory)
        await uow.__aenter__()
        try:
            service = AdminUserService(uow, Pbkdf2PasswordHasher())
            with pytest.raises(ConflictError):
                await service.set_role(only_admin.id, "user", actor_id="кто-то-другой")
        finally:
            await uow.__aexit__(None, None, None)

    async def test_demotion_revokes_sessions(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        user_factory
    ) -> None:
        second = await user_factory(email="second@tver-ryadom.ru", role="admin", name="Второй")
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "second@tver-ryadom.ru", "password": "Пароль-12345"},
        )
        assert login.status_code == 200

        await client.patch(
            f"/api/v1/admin/users/{second.id}/role", headers=admin_headers, json={"role": "user"}
        )
        async with database.session() as session:
            sessions = (
                await session.execute(select(Session).where(Session.user_id == second.id))
            ).scalars().all()
            # Новая роль вступает сразу: цепочки обновления погашены.
            assert all(item.revoked_at is not None for item in sessions)


class TestSettings:
    async def test_saves_and_reads_back(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await client.put(
            "/api/v1/admin/settings",
            headers=admin_headers,
            json={
                "entries": {
                    "contacts.vk": "https://vk.ru/tverexkursii",
                    "calendar.feedToken": "секрет",
                }
            },
        )
        stored = await client.get("/api/v1/admin/settings", headers=admin_headers)
        assert stored.json()["data"]["contacts.vk"] == "https://vk.ru/tverexkursii"


class TestAdminCalendar:
    async def test_slots_carry_guests(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            slot = (
                await session.execute(
                    select(Schedule).where(
                        Schedule.tour_id == catalog.obzornaya,
                        Schedule.status == "open",
                        Schedule.starts_at > datetime.now(UTC),
                    )
                )
            ).scalars().first()

        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "scheduleId": slot.id,
                "peopleCount": 1,
                "contactName": "Мария",
                "contactPhone": "8 900 111-22-33",
            },
        )

        start = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")
        end = (datetime.now(UTC) + timedelta(days=60)).strftime("%Y-%m-%d")
        response = await client.get(
            f"/api/v1/admin/calendar?from={start}&to={end}", headers=admin_headers
        )
        entries = response.json()["data"]["entries"]

        slots = [entry for entry in entries if entry["kind"] == "slot"]
        booked = next(entry for entry in slots if entry["id"] == slot.id)
        # Бронь на слот — не отдельное событие, а гость внутри слота.
        assert [guest["name"] for guest in booked["guests"]] == ["Мария"]
        assert not any(entry["kind"] == "request" for entry in entries)

    async def test_own_date_becomes_a_request(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 3,
                "contactName": "Мария",
                "contactPhone": "8 900 111-22-33",
            },
        )
        start = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (datetime.now(UTC) + timedelta(days=60)).strftime("%Y-%m-%d")
        response = await client.get(
            f"/api/v1/admin/calendar?from={start}&to={end}", headers=admin_headers
        )
        requests = [
            entry for entry in response.json()["data"]["entries"] if entry["kind"] == "request"
        ]
        assert len(requests) == 1
        assert requests[0]["contactPhone"] == "+79001112233"
        assert requests[0]["people"] == 3


class TestDashboard:
    async def test_counts_and_recent(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        await client.post(
            "/api/v1/bookings",
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Мария",
                "contactPhone": "8 900 111-22-33",
            },
        )
        response = await client.get("/api/v1/admin/stats", headers=admin_headers)
        data = response.json()["data"]

        assert data["bookingsToday"] == 1
        assert data["pendingBookings"] == 1
        # В каталоге один отзыв ждёт модерации.
        assert data["pendingReviews"] == 1
        assert data["recentBookings"][0]["contactName"] == "Мария"
        assert len(data["bookingsByDay"]) == 1


class TestAdminAvailability:
    async def test_shows_notes_unlike_public(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await client.post(
            "/api/v1/admin/availability",
            headers=admin_headers,
            json={"from": "2026-12-01", "to": "2026-12-03", "note": "отпуск"},
        )
        admin_view = await client.get(
            "/api/v1/admin/availability?from=2026-12-01&to=2026-12-31", headers=admin_headers
        )
        blocks = admin_view.json()["data"]["blocks"]
        assert len(blocks) == 3
        assert blocks[0]["note"] == "отпуск"

        # Гостю заметка не видна.
        public = await client.get("/api/v1/availability?from=2026-12-01&to=2026-12-31")
        assert "note" not in public.json()["data"]["blocks"][0]

    async def test_opens_day_back(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await client.post(
            "/api/v1/admin/availability",
            headers=admin_headers,
            json={"from": "2026-12-01", "to": "2026-12-03"},
        )
        await client.delete("/api/v1/admin/availability/day/2026-12-02", headers=admin_headers)

        remaining = await client.get(
            "/api/v1/admin/availability?from=2026-12-01&to=2026-12-31", headers=admin_headers
        )
        assert [b["date"] for b in remaining.json()["data"]["blocks"]] == [
            "2026-12-01",
            "2026-12-03",
        ]
