"""Отзывы, избранное и обращения."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.domain.models.content import ContactRequest, Review
from app.domain.models.notifications import Notification
from app.domain.models.tours import Tour
from tests.factories import CatalogFixture


async def register(client: AsyncClient, email: str = "egor@example.com") -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Егор", "email": email, "password": "Пароль-12345"},
    )
    return response.json()["data"]["accessToken"]


class TestLatestReviews:
    async def test_lists_approved_newest_first(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/reviews/latest")
        assert response.status_code == 200
        items = response.json()["data"]

        assert [item["authorName"] for item in items] == ["Татьяна П.", "Ирина В."]
        # Отзыв на модерации в ленту попадать не должен.
        assert all("не одобрен" not in item["text"] for item in items)
        assert items[0]["tour"]["slug"] == "obzornaya-po-tveri"

    async def test_hides_reviews_of_unpublished_tours(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        async with database.session() as session:
            tour = await session.get(Tour, catalog.obzornaya)
            tour.status = "archived"
            await session.commit()

        # Лента ведёт на страницу экскурсии, а её больше нет.
        assert await client.get("/api/v1/reviews/latest") is not None
        response = await client.get("/api/v1/reviews/latest")
        assert response.json()["data"] == []


class TestCreateReview:
    async def test_guest_review_goes_to_moderation(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/reviews",
            json={
                "tourId": catalog.obzornaya,
                "rating": 5,
                "text": "Отличная экскурсия, рекомендую всем!",
                "authorName": "Гость",
            },
        )
        assert response.status_code == 201
        assert response.json()["data"]["status"] == "pending"

        # На сайте он пока не виден.
        listing = await client.get("/api/v1/tours/obzornaya-po-tveri/reviews")
        assert listing.json()["data"]["total"] == 2

    async def test_guest_must_give_a_name(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/reviews",
            json={
                "tourId": catalog.obzornaya,
                "rating": 5,
                "text": "Отличная экскурсия, рекомендую всем!",
            },
        )
        assert response.status_code == 422
        assert response.json()["error"]["details"] == {"authorName": "Укажите имя"}

    async def test_name_comes_from_profile(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        await client.post(
            "/api/v1/reviews",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "tourId": catalog.obzornaya,
                "rating": 5,
                "text": "Отличная экскурсия, рекомендую всем!",
                # Подписаться чужим именем из своего аккаунта не выйдет.
                "authorName": "Не Егор",
            },
        )
        async with database.session() as session:
            review = (
                await session.execute(select(Review).where(Review.status == "pending"))
            ).scalars().all()[-1]
            assert review.author_name == "Егор"

    async def test_one_review_per_tour(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "tourId": catalog.obzornaya,
            "rating": 5,
            "text": "Отличная экскурсия, рекомендую всем!",
        }

        first = await client.post("/api/v1/reviews", headers=headers, json=payload)
        assert first.status_code == 201
        second = await client.post("/api/v1/reviews", headers=headers, json=payload)
        assert second.status_code == 409

    async def test_validates_rating_and_length(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        too_short = await client.post(
            "/api/v1/reviews",
            json={"tourId": catalog.obzornaya, "rating": 5, "text": "Норм", "authorName": "Гость"},
        )
        assert too_short.status_code == 422

        bad_rating = await client.post(
            "/api/v1/reviews",
            json={
                "tourId": catalog.obzornaya,
                "rating": 9,
                "text": "Отличная экскурсия, рекомендую всем!",
                "authorName": "Гость",
            },
        )
        assert bad_rating.status_code == 422

    async def test_review_for_draft_tour(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            "/api/v1/reviews",
            json={
                "tourId": catalog.draft,
                "rating": 5,
                "text": "Отличная экскурсия, рекомендую всем!",
                "authorName": "Гость",
            },
        )
        assert response.status_code == 404


class TestFavorites:
    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/favorites")).status_code == 401

    async def test_add_list_remove(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}

        added = await client.put(f"/api/v1/favorites/{catalog.obzornaya}", headers=headers)
        assert added.status_code == 201

        listing = await client.get("/api/v1/favorites", headers=headers)
        items = listing.json()["data"]
        assert len(items) == 1
        assert items[0]["tour"]["slug"] == "obzornaya-po-tveri"
        # Карточка в избранном — та же, что в каталоге, со всеми полями.
        assert items[0]["tour"]["ratingAvg"] == 5.0
        assert items[0]["addedAt"]

        removed = await client.delete(f"/api/v1/favorites/{catalog.obzornaya}", headers=headers)
        assert removed.status_code == 200
        assert (await client.get("/api/v1/favorites", headers=headers)).json()["data"] == []

    async def test_adding_twice_is_not_an_error(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Сердечко могли нажать дважды или открыть страницу в двух вкладках.
        await client.put(f"/api/v1/favorites/{catalog.obzornaya}", headers=headers)
        again = await client.put(f"/api/v1/favorites/{catalog.obzornaya}", headers=headers)
        assert again.status_code == 201
        assert len((await client.get("/api/v1/favorites", headers=headers)).json()["data"]) == 1

    async def test_removing_absent_is_not_an_error(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        response = await client.delete(
            f"/api/v1/favorites/{catalog.obzornaya}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

    async def test_cannot_favorite_a_draft(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        response = await client.put(
            f"/api/v1/favorites/{catalog.draft}", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 404

    async def test_unpublished_tour_disappears_from_list(
        self, client: AsyncClient, database: Database, catalog: CatalogFixture
    ) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}
        await client.put(f"/api/v1/favorites/{catalog.obzornaya}", headers=headers)

        async with database.session() as session:
            tour = await session.get(Tour, catalog.obzornaya)
            tour.status = "archived"
            await session.commit()

        # Из списка пропала, но сама запись цела: экскурсию могут вернуть.
        assert (await client.get("/api/v1/favorites", headers=headers)).json()["data"] == []

    async def test_favorites_are_private(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        mine = await register(client, "egor@example.com")
        await client.put(
            f"/api/v1/favorites/{catalog.obzornaya}",
            headers={"Authorization": f"Bearer {mine}"},
        )
        stranger = await register(client, "other@example.com")
        response = await client.get(
            "/api/v1/favorites", headers={"Authorization": f"Bearer {stranger}"}
        )
        assert response.json()["data"] == []


class TestContactRequests:
    async def test_accepts_request_and_notifies_admin(
        self, client: AsyncClient, database: Database, user_factory
    ) -> None:
        await user_factory(email="admin@tver-ryadom.ru", role="admin", name="Елена")

        response = await client.post(
            "/api/v1/contact",
            json={
                "name": "Мария",
                "phone": "8 900 111-22-33",
                "message": "Хочу экскурсию на выходных, нас четверо.",
            },
        )
        assert response.status_code == 201
        assert response.json()["data"]["received"] is True

        async with database.session() as session:
            request = (await session.execute(select(ContactRequest))).scalars().one()
            assert request.phone == "+79001112233"
            assert request.status == "new"

            # Елена должна узнать об обращении, не заглядывая в админку.
            notification = (await session.execute(select(Notification))).scalars().one()
            assert notification.type == "admin_new_request"
            assert notification.payload["contactName"] == "Мария"

    async def test_email_alone_is_enough(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/contact",
            json={
                "name": "Мария",
                "email": "Maria@Example.COM",
                "message": "Хочу экскурсию на выходных.",
            },
        )
        assert response.status_code == 201

    async def test_requires_a_way_back(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/contact",
            json={"name": "Мария", "message": "Хочу экскурсию на выходных."},
        )
        # Обращение без контакта бесполезно: ответить будет некуда.
        assert response.status_code == 422

    async def test_validates_message_length(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/contact",
            json={"name": "Мария", "phone": "8 900 111-22-33", "message": "Ау"},
        )
        assert response.status_code == 422
