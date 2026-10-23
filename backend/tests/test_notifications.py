"""Уведомления: кабинет, очередь доставки, напоминания."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import Booking
from app.domain.models.notifications import Notification, OutboxMessage
from app.domain.models.tours import Schedule
from app.domain.schemas.notifications import OutboxFilter
from app.integrations.senders import MessageSender, SenderRegistry
from app.services.notifications.notifier import OutboxNotifier
from app.services.notifications.outbox import OutboxProcessor
from app.services.notifications.reminders import ReminderService
from app.services.notifications.service import OutboxAdminService
from app.services.notifications.templates import RenderedMessage, format_msk, render
from tests.factories import CatalogFixture


class FakeSender(MessageSender):
    """Канал, который ничего не шлёт, а копит отправленное."""

    def __init__(self, channel: str, *, fails: bool = False) -> None:
        self.channel = channel
        self.sent: list[tuple[str, RenderedMessage]] = []
        self._fails = fails

    @property
    def enabled(self) -> bool:
        return True

    async def send(self, recipient: str, message: RenderedMessage) -> None:
        if self._fails:
            raise RuntimeError("канал недоступен")
        self.sent.append((recipient, message))


class TestTemplates:
    def test_booking_created(self) -> None:
        message = render(
            "booking_created",
            {
                "tourTitle": "Живые истории старого города",
                "startsAt": "3 ноября, 14:00",
                "peopleCount": 2,
                "totalPriceLabel": "4 500 ₽",
            },
        )
        assert "Заявка принята" in message.text
        assert "Живые истории старого города" in message.text
        assert message.subject == "Заявка на экскурсию принята"
        assert "<div" in message.html

    def test_escapes_user_text(self) -> None:
        # Сырьё лежит в базе как есть, чистка — только на отрисовке.
        message = render("admin_new_request", {"message": "<script>alert(1)</script>"})
        assert "<script>" not in message.text
        assert "&lt;script&gt;" in message.text

    def test_unknown_template_still_sends_something(self) -> None:
        # Потерять уведомление из-за опечатки в имени хуже, чем отправить
        # неказистое.
        message = render("такого-нет", {"tourTitle": "Обзорная"})
        assert "Обзорная" in message.text
        assert message.subject == "Уведомление"

    def test_date_is_moscow(self) -> None:
        # 21:30 UTC — уже следующие сутки в Твери.
        assert format_msk(datetime(2026, 11, 3, 21, 30, tzinfo=UTC)) == "4 ноября, 00:30"

    def test_empty_fields_do_not_leak(self) -> None:
        message = render("booking_created", {"tourTitle": "Обзорная"})
        assert "None" not in message.text
        assert "Участников" not in message.text


class TestNotifierEnqueues:
    async def test_writes_cabinet_and_queue_together(
        self, database: Database, user_factory
    ) -> None:
        user = await user_factory(email="guest@example.com", telegram_chat_id="555")

        async with UnitOfWork(database.session_factory) as uow:
            await OutboxNotifier(uow).notify_user(user.id, "booking_created", {"a": 1})
            await uow.commit()

        async with database.session() as session:
            cabinet = (await session.execute(select(Notification))).scalars().all()
            queue = (await session.execute(select(OutboxMessage))).scalars().all()

        assert len(cabinet) == 1
        # Два канала: Telegram и почта — оба подключены у этого человека.
        assert {item.channel for item in queue} == {"telegram", "email"}
        assert {item.recipient for item in queue} == {"555", "guest@example.com"}

    async def test_user_without_channels_gets_only_cabinet(
        self, database: Database, user_factory
    ) -> None:
        user = await user_factory(email=None, password=None, telegram_chat_id=None)

        async with UnitOfWork(database.session_factory) as uow:
            await OutboxNotifier(uow).notify_user(user.id, "booking_created", {})
            await uow.commit()

        async with database.session() as session:
            assert len((await session.execute(select(Notification))).scalars().all()) == 1
            assert (await session.execute(select(OutboxMessage))).scalars().all() == []

    async def test_admins_get_telegram_only(self, database: Database, user_factory) -> None:
        await user_factory(
            email="elena@tver-ryadom.ru", role="admin", telegram_chat_id="777"
        )
        async with UnitOfWork(database.session_factory) as uow:
            await OutboxNotifier(uow).notify_admins("admin_new_booking", {})
            await uow.commit()

        async with database.session() as session:
            queue = (await session.execute(select(OutboxMessage))).scalars().all()
        # Письма о каждой заявке превратились бы в поток, который не читают.
        assert [item.channel for item in queue] == ["telegram"]

    async def test_empty_values_are_dropped(self, database: Database, user_factory) -> None:
        user = await user_factory(telegram_chat_id="555")
        async with UnitOfWork(database.session_factory) as uow:
            await OutboxNotifier(uow).notify_user(
                user.id, "booking_created", {"tourTitle": "Обзорная", "comment": None}
            )
            await uow.commit()

        async with database.session() as session:
            item = (await session.execute(select(OutboxMessage))).scalars().first()
        assert "comment" not in item.payload


class TestOutboxProcessing:
    async def _queue(self, database: Database, **kwargs) -> OutboxMessage:
        async with database.session() as session:
            message = OutboxMessage(
                channel=kwargs.get("channel", "telegram"),
                recipient=kwargs.get("recipient", "555"),
                template=kwargs.get("template", "booking_created"),
                payload=kwargs.get("payload", {"tourTitle": "Обзорная"}),
                scheduled_at=kwargs.get("scheduled_at", datetime.now(UTC)),
            )
            session.add(message)
            await session.commit()
            await session.refresh(message)
            return message

    async def test_sends_and_marks(self, database: Database) -> None:
        await self._queue(database)
        telegram = FakeSender("telegram")

        async with UnitOfWork(database.session_factory) as uow:
            report = await OutboxProcessor(uow, SenderRegistry(telegram)).run()

        assert report.picked == 1 and report.sent == 1 and report.failed == 0
        assert telegram.sent[0][0] == "555"
        assert "Обзорная" in telegram.sent[0][1].text

        async with database.session() as session:
            item = (await session.execute(select(OutboxMessage))).scalars().one()
            assert item.status == "sent"
            assert item.sent_at is not None

    async def test_future_tasks_are_not_picked(self, database: Database) -> None:
        await self._queue(database, scheduled_at=datetime.now(UTC) + timedelta(hours=1))
        async with UnitOfWork(database.session_factory) as uow:
            report = await OutboxProcessor(uow, SenderRegistry(FakeSender("telegram"))).run()
        assert report.picked == 0

    async def test_failure_schedules_a_retry(self, database: Database) -> None:
        await self._queue(database)
        async with UnitOfWork(database.session_factory) as uow:
            await OutboxProcessor(
                uow, SenderRegistry(FakeSender("telegram", fails=True))
            ).run()

        async with database.session() as session:
            item = (await session.execute(select(OutboxMessage))).scalars().one()
        assert item.status == "pending"
        assert item.attempts == 1
        assert item.last_error == "канал недоступен"
        # Пауза растёт вдвое: повторять каждую минуту в упавший канал
        # бессмысленно.
        assert item.scheduled_at > datetime.now(UTC) + timedelta(minutes=1)

    async def test_gives_up_after_three_attempts(self, database: Database) -> None:
        message = await self._queue(database)
        async with database.session() as session:
            stored = await session.get(OutboxMessage, message.id)
            stored.attempts = 2
            await session.commit()

        async with UnitOfWork(database.session_factory) as uow:
            await OutboxProcessor(
                uow, SenderRegistry(FakeSender("telegram", fails=True))
            ).run()

        async with database.session() as session:
            item = (await session.execute(select(OutboxMessage))).scalars().one()
        # Одно недоставляемое сообщение не должно крутиться вечно.
        assert item.status == "failed"

    async def test_unknown_channel_fails_loudly(self, database: Database) -> None:
        await self._queue(database, channel="sms")
        async with UnitOfWork(database.session_factory) as uow:
            report = await OutboxProcessor(uow, SenderRegistry(FakeSender("telegram"))).run()

        assert report.failed == 1
        async with database.session() as session:
            item = (await session.execute(select(OutboxMessage))).scalars().one()
        # Молчаливое «ничего не делаем» выглядело бы как успешная доставка.
        assert "не подключён" in item.last_error

    async def test_one_failure_does_not_stop_the_batch(self, database: Database) -> None:
        await self._queue(database, channel="telegram")
        await self._queue(database, channel="email", recipient="guest@example.com")

        email = FakeSender("email")
        async with UnitOfWork(database.session_factory) as uow:
            report = await OutboxProcessor(
                uow, SenderRegistry(FakeSender("telegram", fails=True), email)
            ).run()

        assert report.picked == 2 and report.sent == 1 and report.failed == 1
        assert len(email.sent) == 1


class TestReminders:
    async def _confirmed_booking(
        self, database: Database, catalog: CatalogFixture, user_id: str, hours: int
    ) -> Booking:
        async with database.session() as session:
            slot = Schedule(
                tour_id=catalog.obzornaya,
                starts_at=datetime.now(UTC) + timedelta(hours=hours),
                capacity=5,
            )
            session.add(slot)
            await session.flush()
            booking = Booking(
                user_id=user_id,
                tour_id=catalog.obzornaya,
                schedule_id=slot.id,
                people_count=2,
                total_price=450000,
                status="confirmed",
                contact_name="Мария",
                contact_phone="+79001112233",
            )
            session.add(booking)
            await session.commit()
            await session.refresh(booking)
            return booking

    async def test_reminds_about_tomorrow(
        self, database: Database, catalog: CatalogFixture, user_factory
    ) -> None:
        user = await user_factory(telegram_chat_id="555")
        await self._confirmed_booking(database, catalog, user.id, hours=20)

        async with UnitOfWork(database.session_factory) as uow:
            report = await ReminderService(uow, OutboxNotifier(uow)).run()

        assert report.reminders == 1
        async with database.session() as session:
            queued = (await session.execute(select(OutboxMessage))).scalars().all()
        assert queued[0].template == "booking_reminder"

    async def test_does_not_remind_twice(
        self, database: Database, catalog: CatalogFixture, user_factory
    ) -> None:
        user = await user_factory(telegram_chat_id="555")
        await self._confirmed_booking(database, catalog, user.id, hours=20)

        async with UnitOfWork(database.session_factory) as uow:
            await ReminderService(uow, OutboxNotifier(uow)).run()
        async with UnitOfWork(database.session_factory) as uow:
            again = await ReminderService(uow, OutboxNotifier(uow)).run()

        # Отметка об отправке защищает от повтора между тиками.
        assert again.reminders == 0

    async def test_ignores_distant_and_unconfirmed(
        self, database: Database, catalog: CatalogFixture, user_factory
    ) -> None:
        user = await user_factory(telegram_chat_id="555")
        await self._confirmed_booking(database, catalog, user.id, hours=72)

        async with UnitOfWork(database.session_factory) as uow:
            report = await ReminderService(uow, OutboxNotifier(uow)).run()
        assert report.reminders == 0

    async def test_respects_switched_off_reminder(
        self, database: Database, catalog: CatalogFixture, user_factory
    ) -> None:
        user = await user_factory(telegram_chat_id="555")
        booking = await self._confirmed_booking(database, catalog, user.id, hours=20)
        async with database.session() as session:
            stored = await session.get(Booking, booking.id)
            stored.reminder_off = True
            await session.commit()

        async with UnitOfWork(database.session_factory) as uow:
            report = await ReminderService(uow, OutboxNotifier(uow)).run()
        # Человек выключил напоминание по этой брони в боте.
        assert report.reminders == 0


class TestCabinetEndpoints:
    async def _register(self, client: AsyncClient) -> str:
        response = await client.post(
            "/api/v1/auth/register",
            json={"name": "Егор", "email": "egor@example.com", "password": "Пароль-12345"},
        )
        return response.json()["data"]["accessToken"]

    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/notifications")).status_code == 401

    async def test_lists_with_unread_counter(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await self._register(client)
        headers = {"Authorization": f"Bearer {token}"}
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        await client.post(
            "/api/v1/bookings",
            headers=headers,
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Егор",
                "contactPhone": "8 900 111-22-33",
            },
        )

        response = await client.get("/api/v1/notifications", headers=headers)
        data = response.json()["data"]
        assert data["total"] == 1
        assert data["unread"] == 1
        assert data["items"][0]["type"] == "booking_created"

    async def test_marks_everything_read(
        self, client: AsyncClient, catalog: CatalogFixture
    ) -> None:
        token = await self._register(client)
        headers = {"Authorization": f"Bearer {token}"}
        moment = (datetime.now(UTC) + timedelta(days=20)).replace(microsecond=0)
        await client.post(
            "/api/v1/bookings",
            headers=headers,
            json={
                "tourId": catalog.obzornaya,
                "desiredDate": moment.isoformat(),
                "peopleCount": 2,
                "contactName": "Егор",
                "contactPhone": "8 900 111-22-33",
            },
        )

        await client.post("/api/v1/notifications/read", headers=headers, json={})
        data = (await client.get("/api/v1/notifications", headers=headers)).json()["data"]
        assert data["unread"] == 0

    async def test_notifications_are_private(
        self, client: AsyncClient, database: Database, user_factory
    ) -> None:
        # Уведомление есть у другого человека — в моём списке его быть
        # не должно.
        other = await user_factory(email="other@example.com")
        async with UnitOfWork(database.session_factory) as uow:
            await OutboxNotifier(uow).notify_user(other.id, "booking_created", {})
            await uow.commit()

        token = await self._register(client)
        response = await client.get(
            "/api/v1/notifications", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.json()["data"]["total"] == 0


class TestOutboxAdmin:
    @pytest.fixture
    async def admin_headers(self, client: AsyncClient, user_factory) -> dict[str, str]:
        await user_factory(email="admin@tver-ryadom.ru", role="admin", name="Елена")
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@tver-ryadom.ru", "password": "Пароль-12345"},
        )
        return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}

    async def test_lists_failed(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str]
    ) -> None:
        async with database.session() as session:
            session.add(
                OutboxMessage(
                    channel="telegram",
                    recipient="555",
                    template="booking_created",
                    payload={},
                    status="failed",
                    attempts=3,
                    last_error="канал недоступен",
                    scheduled_at=datetime.now(UTC),
                )
            )
            await session.commit()

        response = await client.get(
            "/api/v1/admin/outbox?status=failed", headers=admin_headers
        )
        items = response.json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["lastError"] == "канал недоступен"

    async def test_retry_returns_to_queue(
        self, client: AsyncClient, database: Database, admin_headers: dict[str, str]
    ) -> None:
        async with database.session() as session:
            message = OutboxMessage(
                channel="telegram",
                recipient="555",
                template="booking_created",
                payload={},
                status="failed",
                attempts=3,
                last_error="канал недоступен",
                scheduled_at=datetime.now(UTC),
            )
            session.add(message)
            await session.commit()
            await session.refresh(message)

        await client.post(f"/api/v1/admin/outbox/{message.id}/retry", headers=admin_headers)

        async with database.session() as session:
            stored = await session.get(OutboxMessage, message.id)
            assert stored.status == "pending"
            # Причина была внешней и её устранили — попытки с нуля.
            assert stored.attempts == 0
            assert stored.last_error is None

    async def test_filter_shape(self) -> None:
        filter_ = OutboxFilter.model_validate({"status": "failed", "page": 2, "limit": 10})
        assert filter_.offset == 10


class TestAdminOutboxAccess:
    async def test_guest_rejected(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/admin/outbox")).status_code == 401


class TestOutboxAdminService:
    async def test_retry_unknown_message(self, database: Database) -> None:
        from app.core.errors import NotFoundError

        async with UnitOfWork(database.session_factory) as uow:
            with pytest.raises(NotFoundError):
                await OutboxAdminService(uow).retry("нет-такого")


class TestBackgroundTick:
    async def test_tick_does_both_jobs(
        self, database: Database, settings, catalog: CatalogFixture, user_factory
    ) -> None:
        """Один проход планировщика: напоминания плюс разбор очереди."""
        from app.scheduler import BackgroundJobs

        user = await user_factory(telegram_chat_id="555")
        async with database.session() as session:
            slot = Schedule(
                tour_id=catalog.obzornaya,
                starts_at=datetime.now(UTC) + timedelta(hours=20),
                capacity=5,
            )
            session.add(slot)
            await session.flush()
            session.add(
                Booking(
                    user_id=user.id,
                    tour_id=catalog.obzornaya,
                    schedule_id=slot.id,
                    people_count=2,
                    total_price=450000,
                    status="confirmed",
                    contact_name="Мария",
                    contact_phone="+79001112233",
                )
            )
            await session.commit()

        jobs = BackgroundJobs(database, settings)
        telegram = FakeSender("telegram")
        jobs.senders = lambda: SenderRegistry(telegram)  # type: ignore[method-assign]

        result = await jobs.tick()

        # Напоминание поставлено в очередь и тут же из неё отправлено.
        assert result["reminders"] == 1
        assert result["sent"] == 1
        assert "завтра экскурсия" in telegram.sent[0][1].text.lower()

    async def test_tick_survives_a_broken_channel(
        self, database: Database, settings
    ) -> None:
        from app.scheduler import BackgroundJobs

        async with database.session() as session:
            session.add(
                OutboxMessage(
                    channel="telegram",
                    recipient="555",
                    template="booking_created",
                    payload={},
                    scheduled_at=datetime.now(UTC),
                )
            )
            await session.commit()

        jobs = BackgroundJobs(database, settings)
        jobs.senders = lambda: SenderRegistry(FakeSender("telegram", fails=True))  # type: ignore[method-assign]

        # Упавшая отправка не должна валить тик целиком.
        result = await jobs.tick()
        assert result["failed"] == 1
