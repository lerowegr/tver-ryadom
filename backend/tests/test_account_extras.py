"""Устройства, восстановление пароля, аватар и привязка Telegram."""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select

from app.core.database import Database
from app.domain.models.auth import Session, User
from app.domain.models.content import Setting
from app.domain.models.notifications import OutboxMessage
from app.services.link_codes import link_codes, reset_codes
from app.services.storage import MemoryStorage


def square(size: int = 256) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (size, size), (90, 90, 90)).save(buffer, format="JPEG")
    return buffer.getvalue()


async def register(client: AsyncClient, email: str = "egor@example.com") -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Егор", "email": email, "password": "Пароль-12345"},
    )
    return response.json()["data"]["accessToken"]


@pytest.fixture
def storage(client: AsyncClient) -> MemoryStorage:
    memory = MemoryStorage()
    client._transport.app.state.storage = memory  # type: ignore[attr-defined]
    return memory


class TestSignedCodes:
    def test_round_trip(self) -> None:
        codes = link_codes("секрет")
        code = codes.create("11111111-2222-3333-4444-555555555555")
        assert codes.verify(code) == "11111111-2222-3333-4444-555555555555"

    def test_telegram_allows_the_shape(self) -> None:
        code = link_codes("секрет").create("11111111-2222-3333-4444-555555555555")
        # Telegram пускает в параметр /start только эти символы и не
        # больше 64 знаков.
        assert len(code) <= 64
        assert all(ch.isalnum() or ch in "-_" for ch in code)

    def test_foreign_signature_rejected(self) -> None:
        code = link_codes("секрет").create("user-1")
        assert link_codes("другой").verify(code) is None

    def test_expired_rejected(self) -> None:
        codes = link_codes("секрет")
        code = codes.create("user-1", now=0)
        assert codes.verify(code) is None

    def test_purposes_do_not_mix(self) -> None:
        # Код привязки не должен работать как ссылка восстановления.
        code = link_codes("секрет").create("user-1")
        assert reset_codes("секрет").verify(code) is None

    def test_garbage_rejected(self) -> None:
        assert link_codes("секрет").verify("не-код") is None


class TestSessions:
    async def test_lists_own_devices(self, client: AsyncClient) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(
            "/api/v1/auth/login",
            json={"email": "egor@example.com", "password": "Пароль-12345"},
        )

        response = await client.get("/api/v1/auth/sessions", headers=headers)
        items = response.json()["data"]
        assert len(items) == 2
        # Хеша токена в ответе быть не должно.
        assert all("refreshTokenHash" not in item for item in items)

    async def test_revokes_one(self, client: AsyncClient) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}
        other = await client.post(
            "/api/v1/auth/login",
            json={"email": "egor@example.com", "password": "Пароль-12345"},
        )
        other_refresh = other.cookies.get("refresh_token")

        sessions = (await client.get("/api/v1/auth/sessions", headers=headers)).json()["data"]
        victim = sessions[0]["id"]
        revoked = await client.delete(f"/api/v1/auth/sessions/{victim}", headers=headers)
        assert revoked.status_code == 200

        client.cookies.set("refresh_token", other_refresh or "")
        replay = await client.post("/api/v1/auth/refresh")
        assert replay.status_code == 401

    async def test_cannot_revoke_someone_elses(
        self, client: AsyncClient, database: Database
    ) -> None:
        await register(client, "first@example.com")
        async with database.session() as session:
            victim = (await session.execute(select(Session))).scalars().first()

        stranger = await register(client, "second@example.com")
        response = await client.delete(
            f"/api/v1/auth/sessions/{victim.id}",
            headers={"Authorization": f"Bearer {stranger}"},
        )
        # Иначе по идентификатору можно было бы выбивать чужие устройства.
        assert response.status_code == 404


class TestPasswordReset:
    async def test_answer_does_not_reveal_registration(self, client: AsyncClient) -> None:
        await register(client)
        known = await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "egor@example.com"}
        )
        unknown = await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "никого@example.com"}
        )
        assert known.status_code == unknown.status_code == 200
        assert known.json() == unknown.json()

    async def test_letter_is_queued(self, client: AsyncClient, database: Database) -> None:
        await register(client)
        await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "egor@example.com"}
        )
        async with database.session() as session:
            messages = (await session.execute(select(OutboxMessage))).scalars().all()
        letters = [item for item in messages if item.template == "password_reset"]
        assert len(letters) == 1
        assert "/auth/reset?token=" in letters[0].payload["resetUrl"]

    async def test_unknown_email_queues_nothing(
        self, client: AsyncClient, database: Database
    ) -> None:
        await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "никого@example.com"}
        )
        async with database.session() as session:
            assert (await session.execute(select(OutboxMessage))).scalars().all() == []

    async def test_confirm_changes_password_and_logs_in(
        self, client: AsyncClient, database: Database, settings
    ) -> None:
        await register(client)
        async with database.session() as session:
            user = (await session.execute(select(User))).scalars().one()
        token = reset_codes(settings.jwt_secret).create(user.id)

        response = await client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "password": "Совсем-Новый-9876"},
        )
        assert response.status_code == 200
        assert response.json()["data"]["accessToken"]

        again = await client.post(
            "/api/v1/auth/login",
            json={"email": "egor@example.com", "password": "Совсем-Новый-9876"},
        )
        assert again.status_code == 200

    async def test_confirm_revokes_old_sessions(
        self, client: AsyncClient, database: Database, settings
    ) -> None:
        await register(client)
        stale = client.cookies.get("refresh_token")
        async with database.session() as session:
            user = (await session.execute(select(User))).scalars().one()

        await client.post(
            "/api/v1/auth/password-reset/confirm",
            json={
                "token": reset_codes(settings.jwt_secret).create(user.id),
                "password": "Совсем-Новый-9876",
            },
        )
        client.cookies.set("refresh_token", stale or "")
        # Ссылка могла утечь вместе со старой сессией.
        assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    async def test_bad_token_refused(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": "подделка", "password": "Совсем-Новый-9876"},
        )
        assert response.status_code == 422


class TestAvatar:
    async def test_upload_and_delete(
        self, client: AsyncClient, storage: MemoryStorage
    ) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.post(
            "/api/v1/auth/avatar",
            headers=headers,
            files={"file": ("avatar.jpg", square(), "image/jpeg")},
        )
        assert response.status_code == 200
        # Метка времени не даёт браузеру показать прежнюю картинку из кэша.
        assert "?v=" in response.json()["data"]["avatarUrl"]
        assert len(storage.objects) == 1

        profile = await client.get("/api/v1/auth/me", headers=headers)
        assert profile.json()["data"]["avatarKey"].startswith("avatars/")

        await client.delete("/api/v1/auth/avatar", headers=headers)
        assert storage.objects == {}
        profile = await client.get("/api/v1/auth/me", headers=headers)
        assert profile.json()["data"]["avatarKey"] is None

    async def test_key_is_stable(self, client: AsyncClient, storage: MemoryStorage) -> None:
        token = await register(client)
        headers = {"Authorization": f"Bearer {token}"}
        for _ in range(3):
            await client.post(
                "/api/v1/auth/avatar",
                headers=headers,
                files={"file": ("avatar.jpg", square(), "image/jpeg")},
            )
        # Ключ один и тот же, поэтому мусор в хранилище не копится.
        assert len(storage.objects) == 1

    async def test_rejects_non_image(
        self, client: AsyncClient, storage: MemoryStorage
    ) -> None:
        token = await register(client)
        response = await client.post(
            "/api/v1/auth/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("shell.jpg", b"<?php ?>", "image/jpeg")},
        )
        assert response.status_code == 422

    async def test_needs_auth(self, client: AsyncClient, storage: MemoryStorage) -> None:
        response = await client.post(
            "/api/v1/auth/avatar", files={"file": ("a.jpg", square(), "image/jpeg")}
        )
        assert response.status_code == 401


class TestTelegramLink:
    async def test_unavailable_without_bot(self, client: AsyncClient) -> None:
        token = await register(client)
        response = await client.get(
            "/api/v1/auth/telegram-link", headers={"Authorization": f"Bearer {token}"}
        )
        # Бот не подключён — кнопку в кабинете показывать нечему.
        assert response.json()["data"]["available"] is False

    async def test_link_when_username_known(
        self, client: AsyncClient, database: Database
    ) -> None:
        async with database.session() as session:
            session.add(Setting(key="telegram.username", value="tver_ryadom_bot"))
            await session.commit()

        token = await register(client)
        response = await client.get(
            "/api/v1/auth/telegram-link", headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()["data"]
        assert data["available"] is True
        assert data["url"].startswith("https://t.me/tver_ryadom_bot?start=")


class TestPublicSettings:
    async def test_serves_whitelisted_keys_only(
        self, client: AsyncClient, database: Database
    ) -> None:
        async with database.session() as session:
            session.add_all([
                Setting(key="contacts.vk", value="https://vk.ru/tverexkursii"),
                Setting(key="schedule.intro", value="Расписание на месяц"),
                Setting(key="calendar.feedToken", value="секрет"),
                Setting(key="telegram.webhookSecret", value="секрет"),
            ])
            await session.commit()

        data = (await client.get("/api/v1/settings")).json()["data"]
        assert data["contacts.vk"] == "https://vk.ru/tverexkursii"
        assert data["schedule.intro"] == "Расписание на месяц"
        # Служебные настройки наружу уходить не должны.
        assert "calendar.feedToken" not in data
        assert "telegram.webhookSecret" not in data
