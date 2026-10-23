"""Регистрация, вход, сессии и профиль.

Проверки повторяют те, что были на Vitest: формат ответа и поведение
должны совпасть с прежним API, иначе сайт и боты это заметят.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from urllib.parse import urlencode

import pytest
from httpx import AsyncClient

BOT_TOKEN = "123456:AAF-fake-token-for-tests"


def sign_init_data(token: str, fields: dict[str, str]) -> str:
    """Подпись считается независимо — средствами hmac, а не тем же кодом,
    что проверяется. Иначе тест повторил бы ошибку реализации."""
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": signature})


def fresh_fields() -> dict[str, str]:
    return {
        "auth_date": str(int(datetime.now(UTC).timestamp()) - 60),
        "query_id": "AAH-test",
        "user": json.dumps({"id": 987654321, "first_name": "Елена", "last_name": "Громова"}),
    }


class TestRegistration:
    async def test_creates_account_and_session(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "name": "Егор",
                "email": "Egor@Example.COM",
                "password": "Пароль-12345",
                "phone": "8 910 931-23-55",
            },
        )
        assert response.status_code == 201
        payload = response.json()
        assert payload["success"] is True

        user = payload["data"]["user"]
        # Почта приводится к нижнему регистру, телефон — к +7XXXXXXXXXX.
        assert user["email"] == "egor@example.com"
        assert user["phone"] == "+79109312355"
        assert user["role"] == "user"
        assert user["emailVerified"] is False
        assert user["telegramLinked"] is False
        # Хеш пароля наружу не уходит ни под каким именем.
        assert "passwordHash" not in user
        assert "password_hash" not in user

        assert payload["data"]["accessToken"]
        # Refresh-токен живёт только в куке: из тела его достал бы любой скрипт.
        assert "refreshToken" not in payload["data"]
        assert response.cookies.get("refresh_token")

    async def test_rejects_duplicate_email_ignoring_case(self, client: AsyncClient) -> None:
        payload = {"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"}
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        second = await client.post(
            "/api/v1/auth/register",
            json={**payload, "email": "EGOR@example.com"},
        )
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "conflict"

    @pytest.mark.parametrize(
        ("field", "value"),
        [("password", "корот"), ("name", "Я"), ("email", "не-почта"), ("phone", "12345")],
    )
    async def test_validates_input(self, client: AsyncClient, field: str, value: str) -> None:
        payload = {
            "name": "Егор",
            "email": "egor@example.com",
            "password": "Пароль-12345",
            field: value,
        }
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestLogin:
    async def test_accepts_correct_password(self, client: AsyncClient, user_factory) -> None:
        await user_factory(email="elena@example.com", password="Пароль-12345")
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "elena@example.com", "password": "Пароль-12345"},
        )
        assert response.status_code == 200
        assert response.json()["data"]["user"]["email"] == "elena@example.com"

    async def test_same_answer_for_wrong_password_and_unknown_email(
        self, client: AsyncClient, user_factory
    ) -> None:
        await user_factory(email="elena@example.com", password="Пароль-12345")

        wrong = await client.post(
            "/api/v1/auth/login",
            json={"email": "elena@example.com", "password": "не-тот-пароль"},
        )
        unknown = await client.post(
            "/api/v1/auth/login",
            json={"email": "никого@example.com", "password": "Пароль-12345"},
        )
        # Разные сообщения подсказали бы, какие адреса зарегистрированы.
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]

    async def test_account_without_password_cannot_log_in(
        self, client: AsyncClient, user_factory
    ) -> None:
        # Аккаунт из Telegram: пароля у него нет, и вход по паролю невозможен.
        await user_factory(email="tg@example.com", password=None, telegram_chat_id="42")
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "tg@example.com", "password": "Пароль-12345"},
        )
        assert response.status_code == 401


class TestSessionLifecycle:
    async def test_refresh_rotates_token(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        first_token = client.cookies.get("refresh_token")

        response = await client.post("/api/v1/auth/refresh")
        assert response.status_code == 200
        second_token = response.cookies.get("refresh_token")
        assert second_token and second_token != first_token

    async def test_old_refresh_token_stops_working(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        stale = client.cookies.get("refresh_token")
        await client.post("/api/v1/auth/refresh")

        # Перехваченный токен должен умереть сразу после обновления.
        client.cookies.set("refresh_token", stale or "")
        replay = await client.post("/api/v1/auth/refresh")
        assert replay.status_code == 401

    async def test_logout_revokes_session(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        token = client.cookies.get("refresh_token")

        assert (await client.post("/api/v1/auth/logout")).status_code == 200
        client.cookies.set("refresh_token", token or "")
        replay = await client.post("/api/v1/auth/refresh")
        assert replay.status_code == 401

    async def test_refresh_without_cookie_is_unauthorized(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/auth/refresh")
        assert response.status_code == 401


class TestProfile:
    async def _register(self, client: AsyncClient) -> str:
        response = await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        return response.json()["data"]["accessToken"]

    async def test_me_requires_token(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/auth/me")).status_code == 401

    async def test_me_returns_profile(self, client: AsyncClient) -> None:
        token = await self._register(client)
        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["data"]["name"] == "Егор"

    async def test_garbage_token_is_rejected(self, client: AsyncClient) -> None:
        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert response.status_code == 401

    async def test_update_profile(self, client: AsyncClient) -> None:
        token = await self._register(client)
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.patch(
            "/api/v1/auth/profile",
            headers=headers,
            json={"name": "Егор Ярцев", "phone": "8 910 931-23-55"},
        )
        assert response.status_code == 200
        assert response.json()["data"]["name"] == "Егор Ярцев"

        # Изменение действительно записалось, а не осталось в объекте ответа.
        again = await client.get("/api/v1/auth/me", headers=headers)
        assert again.json()["data"]["phone"] == "+79109312355"

    async def test_change_password_revokes_other_sessions(self, client: AsyncClient) -> None:
        token = await self._register(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Второй вход — «другое устройство» со своим refresh-токеном.
        other = await client.post(
            "/api/v1/auth/login",
            json={"email": "egor@example.com", "password": "Пароль-12345"},
        )
        other_refresh = other.cookies.get("refresh_token")

        changed = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"currentPassword": "Пароль-12345", "newPassword": "Новый-пароль-98765"},
        )
        assert changed.status_code == 200

        client.cookies.set("refresh_token", other_refresh or "")
        replay = await client.post("/api/v1/auth/refresh")
        assert replay.status_code == 401

        # Новый пароль работает, старый — нет.
        assert (
            await client.post(
                "/api/v1/auth/login",
                json={"email": "egor@example.com", "password": "Новый-пароль-98765"},
            )
        ).status_code == 200
        assert (
            await client.post(
                "/api/v1/auth/login",
                json={"email": "egor@example.com", "password": "Пароль-12345"},
            )
        ).status_code == 401

    async def test_change_password_checks_current(self, client: AsyncClient) -> None:
        token = await self._register(client)
        response = await client.post(
            "/api/v1/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"currentPassword": "не-тот", "newPassword": "Новый-пароль-98765"},
        )
        assert response.status_code == 401


class TestTelegramWebApp:
    async def test_signed_data_creates_account(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/telegram-webapp",
            json={"initData": sign_init_data(BOT_TOKEN, fresh_fields())},
        )
        assert response.status_code == 200
        user = response.json()["data"]["user"]
        assert user["name"] == "Елена Громова"
        assert user["telegramLinked"] is True
        # Ни почты, ни пароля: личность подтвердил сам Telegram.
        assert user["email"] is None

    async def test_second_entry_reuses_account(self, client: AsyncClient) -> None:
        fields = fresh_fields()
        first = await client.post(
            "/api/v1/auth/telegram-webapp", json={"initData": sign_init_data(BOT_TOKEN, fields)}
        )
        second = await client.post(
            "/api/v1/auth/telegram-webapp", json={"initData": sign_init_data(BOT_TOKEN, fields)}
        )
        assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]

    async def test_rejects_tampered_data(self, client: AsyncClient) -> None:
        init_data = sign_init_data(BOT_TOKEN, fresh_fields())
        tampered = init_data.replace("987654321", "111111111")
        response = await client.post("/api/v1/auth/telegram-webapp", json={"initData": tampered})
        assert response.status_code == 401

    async def test_rejects_foreign_signature(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/telegram-webapp",
            json={"initData": sign_init_data("999:OTHER", fresh_fields())},
        )
        assert response.status_code == 401

    async def test_rejects_stale_data(self, client: AsyncClient) -> None:
        stale = fresh_fields()
        stale["auth_date"] = str(int(datetime.now(UTC).timestamp()) - 48 * 60 * 60)
        response = await client.post(
            "/api/v1/auth/telegram-webapp", json={"initData": sign_init_data(BOT_TOKEN, stale)}
        )
        assert response.status_code == 401
