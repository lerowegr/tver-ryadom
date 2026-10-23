"""Предохранители гостевых точек: частота запросов и «я не робот»."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.database import Database
from app.core.rate_limit import MemoryRateLimiter, Rule
from app.main import create_app
from app.services.captcha import CaptchaVerifier
from tests.factories import CatalogFixture


def in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).replace(microsecond=0).isoformat()


class TestMemoryLimiter:
    async def test_counts_within_window(self) -> None:
        limiter = MemoryRateLimiter()
        rule = Rule(limit=2, window_seconds=60, prefix="t")
        assert [await limiter.take("a", rule) for _ in range(3)] == [1, 2, 3]

    async def test_keys_do_not_mix(self) -> None:
        limiter = MemoryRateLimiter()
        rule = Rule(limit=2, window_seconds=60, prefix="t")
        await limiter.take("a", rule)
        # Разные адреса — разные счётчики, иначе один гость закрыл бы
        # форму всем остальным.
        assert await limiter.take("b", rule) == 1

    async def test_window_expires(self) -> None:
        limiter = MemoryRateLimiter()
        rule = Rule(limit=2, window_seconds=0, prefix="t")
        await limiter.take("a", rule)
        assert await limiter.take("a", rule) == 1

    async def test_sweeps_expired(self) -> None:
        limiter = MemoryRateLimiter()
        rule = Rule(limit=1, window_seconds=0, prefix="t")
        for index in range(MemoryRateLimiter.SWEEP_AT + 10):
            await limiter.take(f"key-{index}", rule)
        # Без уборки карта росла бы на каждый новый адрес и не уменьшалась.
        assert len(limiter._buckets) < MemoryRateLimiter.SWEEP_AT + 10


class TestRateLimitedRoutes:
    async def test_login_attempts_are_capped(self, client: AsyncClient, user_factory) -> None:
        await user_factory(email="elena@example.com")
        payload = {"email": "elena@example.com", "password": "не-тот-пароль"}

        codes = [
            (await client.post("/api/v1/auth/login", json=payload)).status_code
            for _ in range(12)
        ]
        # Подбор пароля упирается в предел, а не идёт бесконечно.
        assert 429 in codes
        assert codes.count(401) == 10

    async def test_limit_answer_is_in_the_usual_envelope(
        self, client: AsyncClient, user_factory
    ) -> None:
        await user_factory(email="elena@example.com")
        payload = {"email": "elena@example.com", "password": "не-тот"}
        for _ in range(11):
            response = await client.post("/api/v1/auth/login", json=payload)

        assert response.status_code == 429
        body = response.json()
        assert body["success"] is False
        assert body["error"]["code"] == "rate_limited"

    async def test_contact_form_is_capped(self, client: AsyncClient) -> None:
        payload = {
            "name": "Мария",
            "phone": "8 900 111-22-33",
            "message": "Хочу экскурсию на выходных.",
        }
        codes = [
            (await client.post("/api/v1/contact", json=payload)).status_code
            for _ in range(7)
        ]
        # Форма уходит Елене в Telegram — спамить ею нельзя.
        assert codes.count(201) == 5
        assert codes.count(429) == 2

    async def test_guest_bookings_are_capped(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        payload = {
            "tourId": catalog.obzornaya,
            "peopleCount": 2,
            "contactName": "Гость",
            "contactPhone": "8 900 111-22-33",
        }
        codes = []
        for index in range(22):
            codes.append(
                (
                    await client.post(
                        "/api/v1/bookings", json={**payload, "desiredDate": in_days(index + 2)}
                    )
                ).status_code
            )
        assert codes.count(429) == 2

    async def test_logged_in_user_is_not_limited(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = (
            await client.post(
                "/api/v1/auth/register",
                json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
            )
        ).json()["data"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        codes = []
        for index in range(22):
            codes.append(
                (
                    await client.post(
                        "/api/v1/bookings",
                        headers=headers,
                        json={
                            "tourId": catalog.obzornaya,
                            "desiredDate": in_days(index + 2),
                            "peopleCount": 2,
                            "contactName": "Егор",
                            "contactPhone": "8 900 111-22-33",
                        },
                    )
                ).status_code
            )
        # Вошедшего держат сессия и возможность её отозвать; ограничение
        # по адресу било бы по всем из одной сети.
        assert 429 not in codes

    async def test_reading_is_never_limited(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        codes = [(await client.get("/api/v1/tours")).status_code for _ in range(30)]
        assert set(codes) == {200}


class TestCaptchaVerifier:
    async def test_disabled_lets_everything_through(self) -> None:
        # Виджет не подключён — форма должна работать у всех.
        assert await CaptchaVerifier(None).verify(None) is True

    async def test_enabled_requires_a_token(self) -> None:
        assert await CaptchaVerifier("секрет").verify(None) is False

    async def test_unreachable_check_is_a_refusal(self) -> None:
        # Иначе проверку можно было бы обойти, уронив связь с Cloudflare.
        verifier = CaptchaVerifier("секрет")
        assert await verifier.verify("токен", ip="127.0.0.1") is False


class TestCaptchaOnRoutes:
    @pytest.fixture
    async def client_with_captcha(
        self, settings: Settings, database: Database
    ) -> AsyncClient:
        guarded = settings.model_copy(update={"turnstile_secret": "тестовый-секрет"})
        app = create_app(guarded, database=database)
        app.state.settings = guarded
        app.state.database = database
        app.state.rate_limiter = MemoryRateLimiter()
        return AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        )

    async def test_guest_without_token_is_refused(
        self, client_with_captcha: AsyncClient
    ) -> None:
        async with client_with_captcha as http:
            response = await http.post(
                "/api/v1/contact",
                json={
                    "name": "Мария",
                    "phone": "8 900 111-22-33",
                    "message": "Хочу экскурсию на выходных.",
                },
            )
        assert response.status_code == 422
        assert "Проверка не пройдена" in response.json()["error"]["message"]

    async def test_logged_in_user_skips_captcha(
        self, client_with_captcha: AsyncClient, catalog: CatalogFixture
    ) -> None:
        async with client_with_captcha as http:
            token = (
                await http.post(
                    "/api/v1/auth/register",
                    json={
                        "name": "Егор",
                        "email": "egor@example.com",
                        "password": "Пароль-12345",
                    },
                )
            ).json()["data"]["accessToken"]

            response = await http.post(
                "/api/v1/bookings",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "tourId": catalog.obzornaya,
                    "desiredDate": in_days(10),
                    "peopleCount": 2,
                    "contactName": "Егор",
                    "contactPhone": "8 900 111-22-33",
                },
            )
        # Вошедшему капча не нужна.
        assert response.status_code == 201
