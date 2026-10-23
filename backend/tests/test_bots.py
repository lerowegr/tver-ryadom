"""Боты Telegram, ВКонтакте и MAX."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Database
from app.core.unit_of_work import UnitOfWork
from app.domain.models.auth import User
from app.domain.models.bookings import Booking
from app.domain.models.content import Favorite
from app.domain.models.tours import Schedule
from app.services.availability import AvailabilityService
from app.services.bookings import BookingService
from app.services.channels.accounts import AccountService, ChannelId
from app.services.channels.screens import ScreenBuilder
from app.services.channels.state import BotState, Draft, StateStore
from app.services.channels.telegram import TelegramApi, TelegramChannel
from app.services.channels.vk import VkChannel
from app.services.notifications.notifier import NullNotifier
from tests.factories import CatalogFixture


class FakeTelegram(TelegramApi):
    """Копит вызовы вместо обращений к Bot API."""

    def __init__(self, *, fail_on: set[str] | None = None) -> None:
        super().__init__("123:fake")
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._fail_on = fail_on or set()

    async def call(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((method, payload))
        if method in self._fail_on:
            raise RuntimeError("не принято")
        return {"username": "tver_ryadom_bot", "message_id": 100}

    def sent(self) -> list[dict[str, Any]]:
        return [
            payload
            for method, payload in self.calls
            if method in ("sendMessage", "sendPhoto", "editMessageText", "editMessageMedia")
        ]

    def last_text(self) -> str:
        last = self.sent()[-1]
        return last.get("text") or last.get("caption") or str(last.get("media", {}))

    def last_actions(self) -> list[str]:
        markup = self.sent()[-1].get("reply_markup") or {}
        return [
            button["callback_data"]
            for row in markup.get("inline_keyboard", [])
            for button in row
        ]


def message(text: str, chat_id: str = "555") -> dict[str, Any]:
    return {
        "message": {
            "message_id": 1,
            "chat": {"id": int(chat_id)},
            "from": {"id": int(chat_id), "first_name": "Мария"},
            "text": text,
        }
    }


def tap(action: str, chat_id: str = "555") -> dict[str, Any]:
    return {
        "callback_query": {
            "id": "cb-1",
            "data": action,
            "from": {"id": int(chat_id), "first_name": "Мария"},
            "message": {"message_id": 10, "chat": {"id": int(chat_id)}},
        }
    }


class BotHarness:
    """Канал вместе со своей единицей работы."""

    def __init__(self, database: Database, api: FakeTelegram) -> None:
        self._database = database
        self.api = api

    async def run(self, update: dict[str, Any]) -> None:
        async with UnitOfWork(self._database.session_factory) as uow:
            screens = ScreenBuilder(uow, images_base="https://example.test/images")
            bookings = BookingService(uow, AvailabilityService(uow), NullNotifier())
            channel = TelegramChannel(
                uow, self.api, screens, bookings, site_url="https://tver-ryadom.ru"
            )
            await channel.handle(update)
            await uow.commit()


@pytest.fixture
def bot(database: Database) -> BotHarness:
    return BotHarness(database, FakeTelegram())


class TestParsing:
    def test_reads_a_message(self) -> None:
        incoming = TelegramChannel.parse(message("/start"))
        assert incoming is not None
        assert incoming.chat_id == "555"
        assert incoming.text == "/start"
        assert incoming.display_name == "Мария"
        assert not incoming.is_callback

    def test_reads_a_tap(self) -> None:
        incoming = TelegramChannel.parse(tap("t:list"))
        assert incoming is not None
        assert incoming.action == "t:list"
        assert incoming.is_callback
        assert incoming.message_id == 10

    def test_ignores_everything_else(self) -> None:
        assert TelegramChannel.parse({"edited_message": {}}) is None


class TestConversation:
    async def test_start_greets_from_elena(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(message("/start"))
        text = bot.api.last_text()
        # Приветствие от лица Елены, а не «сервиса».
        assert "Елена Громова" in text
        assert "t:list" in bot.api.last_actions()

    async def test_tours_list(self, bot: BotHarness, catalog: CatalogFixture) -> None:
        await bot.run(tap("t:list"))
        text = bot.api.last_text()
        assert "Живые истории старого города" in text
        # Черновик в список не попадает.
        assert "Ещё не готова" not in text

    async def test_tour_card_has_photo_and_booking(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap(f"t:{catalog.obzornaya}"))
        method, payload = bot.api.calls[-1]
        # У обзорной есть фотография — карточка уходит картинкой.
        assert method == "editMessageMedia"
        assert "example.test/images" in payload["media"]["media"]
        assert f"b:{catalog.obzornaya}" in bot.api.last_actions()

    async def test_about_counts_real_tours(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("about"))
        # Формат считается по самим экскурсиям, а не записан руками.
        assert "маршрутов: 3" in bot.api.last_text()

    async def test_free_question_is_not_faked(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(message("а можно с собакой?"))
        text = bot.api.last_text()
        # Бот не делает вид, что понял, — передаёт вопрос Елене.
        assert "передам ваш вопрос" in text.lower()

    async def test_tap_edits_instead_of_piling_up(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("t:list"))
        await bot.run(tap("about"))
        methods = [method for method, _ in bot.api.calls if method.startswith(("send", "edit"))]
        # Иначе после пяти нажатий чат превращается в ленту карточек.
        assert methods == ["editMessageText", "editMessageText"]

    async def test_falls_back_to_resend_when_edit_rejected(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        # Текст нельзя превратить в фотографию — правку не примут.
        harness = BotHarness(database, FakeTelegram(fail_on={"editMessageMedia"}))
        await harness.run(tap(f"t:{catalog.obzornaya}"))
        methods = [method for method, _ in harness.api.calls]
        assert "deleteMessage" in methods
        assert methods[-1] == "sendPhoto"

    async def test_confirms_the_tap(self, bot: BotHarness, catalog: CatalogFixture) -> None:
        await bot.run(tap("menu"))
        # Иначе кнопка «крутится» у человека до таймаута.
        assert bot.api.calls[0][0] == "answerCallbackQuery"


class TestCarousel:
    async def test_moves_and_wraps(self, bot: BotHarness, catalog: CatalogFixture) -> None:
        await bot.run(tap("c:0"))
        first = bot.api.last_text()

        await bot.run(tap("c:1"))
        assert bot.api.last_text() != first

        # Список закольцован: с последней вправо попадаешь на первую.
        await bot.run(tap("c:3"))
        assert bot.api.last_text() == first

    async def test_negative_index_wraps_too(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("c:-1"))
        assert "Савватьево" in bot.api.last_text()

    async def test_remembers_position(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("c:1"))
        async with UnitOfWork(database.session_factory) as uow:
            state = await StateStore(uow).read("555")
        assert state.carousel == 1


class TestBookingFlow:
    async def _with_phone(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            account = await AccountService(uow).ensure(ChannelId.TELEGRAM, "555", "Мария")
            account.phone = "+79001112233"
            await uow.commit()

    async def test_asks_for_phone_first(
        self, bot: BotHarness, catalog: CatalogFixture, database: Database
    ) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            state = BotState(booking=Draft(tour_id=catalog.obzornaya, people=2))
            state.booking.desired_date = (
                datetime.now(UTC) + timedelta(days=10)
            ).isoformat()
            await StateStore(uow).write("555", state)
            await uow.commit()

        await bot.run(tap("bk:ok"))
        # Без телефона Елена не сможет подтвердить бронь.
        assert "нужен телефон" in bot.api.last_text()
        assert "me:phone" in bot.api.last_actions()

    async def test_slot_booking_end_to_end(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await self._with_phone(database)
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

        await bot.run(tap(f"b:{catalog.obzornaya}"))
        assert "Выберите дату" in bot.api.last_text()

        await bot.run(tap(f"bk:s:{slot.id}"))
        assert "Сколько вас будет" in bot.api.last_text()

        await bot.run(tap("bk:p:2"))
        assert "Проверьте заявку" in bot.api.last_text()

        await bot.run(tap("bk:ok"))
        assert "Заявка принята" in bot.api.last_text()

        async with database.session() as session:
            booking = (await session.execute(select(Booking))).scalars().one()
            assert booking.source == "telegram"
            assert booking.people_count == 2
            assert booking.schedule_id == slot.id
            assert booking.contact_phone == "+79001112233"

    async def test_own_date_asks_day_then_time(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await self._with_phone(database)
        await bot.run(tap(f"b:{catalog.predmeste}"))
        await bot.run(tap("bk:d:own"))
        assert "Какой день" in bot.api.last_text()

        day = (datetime.now(UTC) + timedelta(days=5)).date().isoformat()
        await bot.run(tap(f"bk:d:{day}"))
        assert "Во сколько" in bot.api.last_text()

        await bot.run(tap("bk:t:14:00"))
        assert "Сколько вас будет" in bot.api.last_text()

        await bot.run(tap("bk:p:3"))
        await bot.run(tap("bk:ok"))

        async with database.session() as session:
            booking = (await session.execute(select(Booking))).scalars().one()
            assert booking.schedule_id is None
            # Пояс указан явно: иначе «14:00» уехало бы на три часа.
            assert booking.desired_date.astimezone(UTC).hour == 11

    async def test_cancel_drops_the_draft(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap(f"b:{catalog.obzornaya}"))
        await bot.run(tap("bk:cancel"))
        async with UnitOfWork(database.session_factory) as uow:
            assert (await StateStore(uow).read("555")).booking is None


class TestCabinet:
    async def test_shows_profile_and_channels(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("me"))
        text = bot.api.last_text()
        assert "Личный кабинет" in text
        assert "Telegram" in text
        # Запись одна на все каналы — об этом стоит сказать прямо.
        assert "запись одна" in text

    async def test_edits_phone(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("me:phone"))
        assert "телефон" in bot.api.last_text().lower()

        await bot.run(message("8 900 111-22-33"))
        async with database.session() as session:
            user = (
                await session.execute(select(User).where(User.telegram_chat_id == "555"))
            ).scalars().one()
        assert user.phone == "+79001112233"

    async def test_rejects_nonsense_phone(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("me:phone"))
        await bot.run(message("не телефон"))
        assert "Не похоже на телефон" in bot.api.last_text()

    async def test_text_after_prompt_is_not_a_question(
        self, bot: BotHarness, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("me:name"))
        await bot.run(message("Мария Петровна"))
        # Ответ на поле кабинета не должен уйти как вопрос Елене.
        assert "передам ваш вопрос" not in bot.api.last_text().lower()

    async def test_account_is_created_lazily(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(message("/start"))
        async with database.session() as session:
            users = (await session.execute(select(User))).scalars().all()
        # Заглянувший не должен оставлять после себя пустую запись.
        assert users == []

        await bot.run(tap("me"))
        async with database.session() as session:
            users = (await session.execute(select(User))).scalars().all()
        assert len(users) == 1


class TestFavorites:
    async def test_toggles(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap(f"fav:{catalog.obzornaya}"))
        assert "Добавлено в избранное" in bot.api.last_text()

        async with database.session() as session:
            assert len((await session.execute(select(Favorite))).scalars().all()) == 1

        await bot.run(tap(f"fav:{catalog.obzornaya}"))
        assert "Убрано из избранного" in bot.api.last_text()
        async with database.session() as session:
            assert (await session.execute(select(Favorite))).scalars().all() == []


class TestMyBookings:
    async def test_empty_and_filled(
        self, bot: BotHarness, database: Database, catalog: CatalogFixture
    ) -> None:
        await bot.run(tap("my:list"))
        assert "Предстоящих экскурсий нет" in bot.api.last_text()

        async with UnitOfWork(database.session_factory) as uow:
            account = await AccountService(uow).ensure(ChannelId.TELEGRAM, "555", "Мария")
            uow.session.add(
                Booking(
                    user_id=account.id,
                    tour_id=catalog.obzornaya,
                    desired_date=datetime.now(UTC) + timedelta(days=5),
                    people_count=2,
                    total_price=450000,
                    status="confirmed",
                    contact_name="Мария",
                    contact_phone="+79001112233",
                )
            )
            await uow.commit()

        await bot.run(tap("my:list"))
        text = bot.api.last_text()
        assert "Живые истории старого города" in text
        assert "дата на согласовании" in text


class TestVkChannel:
    def _channel(self, uow: UnitOfWork, **kwargs) -> VkChannel:
        defaults = dict(group_token="токен", confirmation="строка", secret="секрет")
        defaults.update(kwargs)
        return VkChannel(uow, ScreenBuilder(uow), **defaults)  # type: ignore[arg-type]

    async def test_confirmation_echo(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            answer = await self._channel(uow).handle({"type": "confirmation"})
        # Без этого ответа площадка не включит адрес вовсе.
        assert answer == "строка"

    async def test_wrong_secret_is_ignored(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            answer = await self._channel(uow).handle(
                {"type": "message_new", "secret": "чужой", "object": {}}
            )
        assert answer == "ok"

    async def test_answer_is_always_ok(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            # Иначе ВКонтакте будет слать событие снова и снова.
            assert await self._channel(uow).handle({"type": "что-то новое"}) == "ok"


class TestMaxChannel:
    async def test_not_configured_without_api_base(self, database: Database) -> None:
        from app.services.channels.max import MaxChannel

        async with UnitOfWork(database.session_factory) as uow:
            channel = MaxChannel(
                uow, ScreenBuilder(uow), bot_token="токен", api_base=None
            )
            # Токен есть, адреса API нет — канал не готов.
            assert channel.configured is False
            assert await channel.handle({"message": {"chat_id": 1}}) == "ok"

    async def test_refuses_to_send_when_not_configured(self, database: Database) -> None:
        from app.services.channels.max import MaxChannel
        from app.services.channels.screens import Screen

        async with UnitOfWork(database.session_factory) as uow:
            channel = MaxChannel(uow, ScreenBuilder(uow), bot_token=None, api_base=None)
            with pytest.raises(RuntimeError, match="не настроен"):
                await channel.send("1", Screen("привет"))


class TestWebhooks:
    async def test_telegram_requires_the_secret(self, client: AsyncClient) -> None:
        response = await client.post("/webhook/telegram/не-тот", json={})
        # Отвечаем успехом молча: подсказывать, что адрес почти угадан,
        # незачем — а на ошибку Telegram начал бы повторять пакет.
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    async def test_vk_returns_plain_text(self, client: AsyncClient) -> None:
        response = await client.post("/webhook/vk", json={"type": "что-то"})
        assert response.status_code == 200
        assert response.text == "ok"

    async def test_max_returns_plain_text(self, client: AsyncClient) -> None:
        response = await client.post("/webhook/max", json={"message": {}})
        assert response.text == "ok"


class TestAccountSync:
    async def test_one_person_across_channels(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            accounts = AccountService(uow)
            telegram = await accounts.ensure(ChannelId.TELEGRAM, "555", "Мария")
            await accounts.link(ChannelId.VK, "vk-1", telegram.id)
            await uow.commit()

        async with UnitOfWork(database.session_factory) as uow:
            accounts = AccountService(uow)
            from_vk = await accounts.find(ChannelId.VK, "vk-1")
            # Та же запись: синхронизация и есть одна строка на все каналы.
            assert from_vk is not None and from_vk.id == telegram.id
            assert set(await accounts.linked_channels(telegram.id)) == {
                ChannelId.TELEGRAM,
                ChannelId.VK,
            }

    async def test_linking_moves_the_channel(self, database: Database) -> None:
        async with UnitOfWork(database.session_factory) as uow:
            accounts = AccountService(uow)
            first = await accounts.ensure(ChannelId.VK, "vk-1", "Первый")
            second = await accounts.ensure(ChannelId.TELEGRAM, "555", "Второй")
            await uow.commit()

        async with UnitOfWork(database.session_factory) as uow:
            # Один идентификатор канала принадлежит одному человеку.
            await AccountService(uow).link(ChannelId.VK, "vk-1", second.id)
            await uow.commit()

        async with database.session() as session:
            moved = await session.get(User, first.id)
            assert moved.vk_user_id is None


class TestState:
    def test_reads_legacy_draft(self) -> None:
        # Записи первой версии хранили бронь без обёртки.
        state = BotState.from_json('{"tourId": "tour-1", "people": 2}')
        assert state.booking is not None
        assert state.booking.tour_id == "tour-1"
        assert state.booking.people == 2

    def test_survives_broken_payload(self) -> None:
        assert BotState.from_json("не json").booking is None

    def test_round_trip(self) -> None:
        state = BotState(booking=Draft(tour_id="t", people=3), awaiting="phone", carousel=2)
        restored = BotState.from_json(state.to_json())
        assert restored.booking == state.booking
        assert restored.awaiting == "phone"
        assert restored.carousel == 2


class TestAccountLinking:
    """Привязка аккаунта с сайта кодом из /start."""

    class LinkedHarness(BotHarness):
        async def run(self, update: dict[str, Any]) -> None:
            async with UnitOfWork(self._database.session_factory) as uow:
                screens = ScreenBuilder(uow)
                bookings = BookingService(uow, AvailabilityService(uow), NullNotifier())
                channel = TelegramChannel(
                    uow, self.api, screens, bookings, link_secret="секрет"
                )
                await channel.handle(update)
                await uow.commit()

    async def test_valid_code_links_the_account(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        from app.services.link_codes import link_codes

        async with UnitOfWork(database.session_factory) as uow:
            account = User(name="Егор", email="egor@example.com")
            uow.session.add(account)
            await uow.flush()
            user_id = account.id
            await uow.commit()

        harness = self.LinkedHarness(database, FakeTelegram())
        await harness.run(message(f"/start {link_codes('секрет').create(user_id)}"))

        assert "аккаунт привязан" in harness.api.last_text()
        async with database.session() as session:
            linked = await session.get(User, user_id)
            assert linked.telegram_chat_id == "555"

    async def test_stale_code_is_refused(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        from app.services.link_codes import link_codes

        harness = self.LinkedHarness(database, FakeTelegram())
        stale = link_codes("секрет").create("user-1", now=0)
        await harness.run(message(f"/start {stale}"))
        assert "устарела" in harness.api.last_text()

    async def test_foreign_code_is_refused(
        self, database: Database, catalog: CatalogFixture
    ) -> None:
        from app.services.link_codes import link_codes

        harness = self.LinkedHarness(database, FakeTelegram())
        await harness.run(message(f"/start {link_codes('другой').create('user-1')}"))
        assert "устарела" in harness.api.last_text()
