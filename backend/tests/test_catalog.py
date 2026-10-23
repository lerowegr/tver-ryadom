"""Каталог: витрина, страница экскурсии, расписание, отзывы."""

from __future__ import annotations

from httpx import AsyncClient

from tests.factories import CatalogFixture


class TestCatalog:
    async def test_lists_only_published(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/tours")
        assert response.status_code == 200
        data = response.json()["data"]

        assert data["total"] == 3
        slugs = {item["slug"] for item in data["items"]}
        # Черновик не должен появляться в выдаче ни при каких условиях.
        assert "chernovik" not in slugs

    async def test_card_shape(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/tours")
        card = next(
            item
            for item in response.json()["data"]["items"]
            if item["slug"] == "obzornaya-po-tveri"
        )

        # Имена полей — те же, что отдавал прежний API.
        assert card["shortDescription"].startswith("Двухчасовая")
        assert card["priceType"] == "per_group"
        assert card["durationMinutes"] == 120
        assert card["groupMax"] == 5
        assert card["ratingAvg"] == 5.0
        assert card["ratingCount"] == 2
        assert {badge["slug"] for badge in card["badges"]} == {"hit", "walking"}

    async def test_card_image_urls_are_absolute(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours")
        card = next(
            item
            for item in response.json()["data"]["items"]
            if item["slug"] == "obzornaya-po-tveri"
        )
        variants = card["image"]["variants"]

        # Недостающие размеры подставляются оригиналом: вёрстка не обязана
        # знать, успел ли обработчик нарезать варианты.
        assert set(variants) >= {"thumb", "card", "hero", "original"}
        assert all(url.startswith("http") for url in variants.values())
        # Пробелы и кириллица в ключе должны быть закодированы, слеши — нет.
        assert "%20" in variants["original"]
        assert variants["original"].count("/tours/") == 1

    async def test_tour_without_image_has_none(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours")
        card = next(
            item for item in response.json()["data"]["items"] if item["slug"] == "predmeste-tveri"
        )
        assert card["image"] is None


class TestCatalogFilters:
    async def test_filters_by_badge(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/tours?badge=walking")
        data = response.json()["data"]
        assert data["total"] == 2
        assert {item["slug"] for item in data["items"]} == {
            "obzornaya-po-tveri",
            "predmeste-tveri",
        }

    async def test_several_badges_match_any(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours?badge=by-car,hit")
        data = response.json()["data"]
        assert {item["slug"] for item in data["items"]} == {
            "obzornaya-po-tveri",
            "savvatevo-na-avto",
        }

    async def test_unknown_badge_returns_nothing(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours?badge=несуществующий")
        assert response.json()["data"]["total"] == 0

    async def test_filters_by_price_and_duration(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        cheap = await client.get("/api/v1/tours?priceMax=450000")
        assert cheap.json()["data"]["total"] == 2

        short = await client.get("/api/v1/tours?durationMax=120")
        assert short.json()["data"]["total"] == 2

    async def test_search_matches_title_and_description(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        by_title = await client.get("/api/v1/tours?search=Савватьево")
        assert by_title.json()["data"]["total"] == 1

        by_description = await client.get("/api/v1/tours?search=предместье")
        assert by_description.json()["data"]["total"] == 1

    async def test_search_does_not_treat_percent_as_wildcard(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        # Без экранирования «%» нашёл бы вообще всё.
        response = await client.get("/api/v1/tours?search=%25")
        assert response.json()["data"]["total"] == 0

    async def test_sorting(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        ascending = await client.get("/api/v1/tours?sort=price_asc")
        prices = [item["price"] for item in ascending.json()["data"]["items"]]
        assert prices == sorted(prices)

        descending = await client.get("/api/v1/tours?sort=duration_desc")
        durations = [item["durationMinutes"] for item in descending.json()["data"]["items"]]
        assert durations == sorted(durations, reverse=True)

    async def test_pagination(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/tours?limit=2&page=2&sort=price_asc")
        data = response.json()["data"]
        assert data["total"] == 3
        assert data["pages"] == 2
        assert len(data["items"]) == 1

    async def test_rejects_absurd_limit(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/tours?limit=1000")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestTourPage:
    async def test_returns_full_tour(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/tours/obzornaya-po-tveri")
        assert response.status_code == 200
        data = response.json()["data"]

        assert data["fullDescription"].startswith("Приглашаю")
        assert data["meetingPoint"].startswith("У входа в Детский музейный центр")
        assert data["meetingLat"] == 56.8622
        assert data["included"] == ["Сопровождение аттестованного экскурсовода"]
        # У пешеходных прогулок ни программы, ни маршрута.
        assert data["program"] == []
        assert data["routePoints"] == []
        assert len(data["images"]) == 2

    async def test_program_and_route_survive(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours/savvatevo-na-avto")
        data = response.json()["data"]

        assert data["program"][0]["title"] == "Дорога из Твери в Савватьево"
        assert data["program"][0]["durationMinutes"] == 30
        assert data["program"][1]["description"] == "Как возникла обитель."

        # Порядок задаёт sort_order, а не порядок вставки.
        assert [point["title"] for point in data["routePoints"]] == [
            "Успенский собор Отроч монастыря",
            "Знаменский храм, Савватьево",
            "Святой источник",
        ]
        assert data["routePoints"][0]["lat"] == 56.86486

    async def test_shows_only_open_future_slots(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours/obzornaya-po-tveri")
        schedules = response.json()["data"]["schedules"]

        # Из трёх слотов остаётся один: прошедший и закрытый отсеяны.
        assert len(schedules) == 1
        assert schedules[0]["capacity"] == 5
        assert schedules[0]["freeSeats"] == 3

    async def test_unknown_slug_is_not_found(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/tours/net-takoy")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"

    async def test_draft_is_not_found(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        # Черновик не должен открываться по прямой ссылке.
        response = await client.get("/api/v1/tours/chernovik")
        assert response.status_code == 404


class TestTourReviews:
    async def test_only_approved_newest_first(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours/obzornaya-po-tveri/reviews")
        data = response.json()["data"]

        assert data["total"] == 2
        assert [item["authorName"] for item in data["items"]] == ["Татьяна П.", "Ирина В."]
        assert all("не одобрен" not in item["text"] for item in data["items"])

    async def test_reviews_of_unknown_tour(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/tours/net-takoy/reviews")).status_code == 404

    async def test_tour_without_reviews(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/tours/predmeste-tveri/reviews")
        data = response.json()["data"]
        assert data["total"] == 0
        # Пустой список — всё равно одна страница: ноль ломает навигацию.
        assert data["pages"] == 1


class TestBadges:
    async def test_lists_badges(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.get("/api/v1/badges")
        labels = [badge["label"] for badge in response.json()["data"]]
        assert "Хит" in labels
        assert labels == sorted(labels)


class TestSchedule:
    async def test_collects_slots_across_tours(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/schedule")
        assert response.status_code == 200
        items = response.json()["data"]["items"]

        # Два открытых будущих слота у опубликованных экскурсий.
        assert len(items) == 2
        # Раздел читают сверху вниз, поэтому порядок — по возрастанию даты.
        assert [item["startsAt"] for item in items] == sorted(
            item["startsAt"] for item in items
        )

    async def test_slot_carries_tour_card(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/schedule")
        first = response.json()["data"]["items"][0]
        assert first["tour"]["title"].startswith("Экскурсия в Савватьево")
        assert first["freeSeats"] == 0

    async def test_draft_tour_slot_is_hidden(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        response = await client.get("/api/v1/schedule")
        slugs = {item["tour"]["slug"] for item in response.json()["data"]["items"]}
        # Кнопка «Записаться» у черновика вела бы на отсутствующую страницу.
        assert "chernovik" not in slugs
