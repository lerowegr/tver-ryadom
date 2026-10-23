"""Бот Telegram.

Обновления разбираются своими силами, без библиотеки-обёртки: боту нужно
полдюжины методов Bot API, и прямые вызовы через httpx дают полный
контроль и лёгкие тесты — в них вместо сети подставляется заглушка,
копящая отправленное.

Состояние шага живёт в таблице черновиков (см. state.py), потому что у
данных кнопки потолок 64 байта.
"""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.errors import AppError
from app.core.unit_of_work import UnitOfWork
from app.domain.schemas.bookings import BookingCreate
from app.services.bookings import BookingService
from app.services.channels.accounts import AccountService, ChannelId
from app.services.channels.screens import Button, Screen, ScreenBuilder, money
from app.services.channels.state import BotState, Draft, StateStore
from app.services.notifications.templates import format_msk

#: Время начала для заявок на свою дату.
TIMES = ("10:00", "12:00", "14:00", "16:00", "18:00")
#: На сколько дней вперёд предлагаем свою дату.
DAYS_AHEAD = 14

MONTHS_SHORT = (
    "янв", "фев", "мар", "апр", "мая", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек",
)


@dataclass(frozen=True, slots=True)
class Incoming:
    """Разобранное обновление: что пришло и от кого."""

    chat_id: str
    display_name: str
    text: str | None = None
    action: str | None = None
    message_id: int | None = None
    callback_id: str | None = None
    has_photo: bool = False

    @property
    def is_callback(self) -> bool:
        return self.callback_id is not None


class TelegramApi:
    """Тонкая обёртка над Bot API."""

    def __init__(self, token: str | None, client_factory: Any = None) -> None:
        self._token = token
        self._client_factory = client_factory

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def call(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self._token:
            raise RuntimeError("Токен бота не задан")

        import httpx

        factory = self._client_factory or (lambda: httpx.AsyncClient(timeout=15.0))
        async with factory() as client:
            response = await client.post(
                f"https://api.telegram.org/bot{self._token}/{method}",
                json={key: value for key, value in payload.items() if value is not None},
            )
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram {method}: {data.get('description')}")
        return data.get("result") or {}


class TelegramChannel:
    """Разбор обновления и ответ на него."""

    def __init__(
        self,
        uow: UnitOfWork,
        api: TelegramApi,
        screens: ScreenBuilder,
        bookings: BookingService,
        *,
        site_url: str | None = None,
    ) -> None:
        self._uow = uow
        self._api = api
        self._screens = screens
        self._bookings = bookings
        self._state = StateStore(uow)
        self._accounts = AccountService(uow)
        self._site_url = site_url

    # ---- Вход ------------------------------------------------------------

    async def handle(self, update: dict[str, Any]) -> None:
        incoming = self.parse(update)
        if incoming is None:
            return

        if incoming.is_callback:
            # Телеграм ждёт подтверждения нажатия, иначе кнопка «крутится»
            # у человека до таймаута.
            await self._answer_callback(incoming.callback_id)

        try:
            await self._route(incoming)
        except AppError as error:
            await self._send(incoming.chat_id, Screen(error.message, [[Button("← Меню", "menu")]]))

    @staticmethod
    def parse(update: dict[str, Any]) -> Incoming | None:
        callback = update.get("callback_query")
        if callback:
            message = callback.get("message") or {}
            chat = message.get("chat") or {}
            user = callback.get("from") or {}
            return Incoming(
                chat_id=str(chat.get("id") or user.get("id") or ""),
                display_name=_name_of(user),
                action=callback.get("data"),
                message_id=message.get("message_id"),
                callback_id=callback.get("id"),
            )

        message = update.get("message")
        if message:
            chat = message.get("chat") or {}
            return Incoming(
                chat_id=str(chat.get("id") or ""),
                display_name=_name_of(message.get("from") or {}),
                text=message.get("text"),
                message_id=message.get("message_id"),
                has_photo=bool(message.get("photo")),
            )
        return None

    # ---- Разводка --------------------------------------------------------

    async def _route(self, incoming: Incoming) -> None:
        if incoming.action:
            await self._on_action(incoming)
        else:
            await self._on_text(incoming)

    async def _on_text(self, incoming: Incoming) -> None:
        text = (incoming.text or "").strip()
        state = await self._state.read(incoming.chat_id)

        # Ждём ответ на поле кабинета — значит это он, а не вопрос Елене.
        if state.awaiting and text:
            await self._fill_profile(incoming, state, text)
            return

        command = text.lower().lstrip("/").split("@")[0]
        screens = {
            "start": self._screens.welcome,
            "menu": self._screens.welcome,
            "help": self._screens.about,
            "tours": self._screens.tours,
        }
        if command in screens:
            await self._send(incoming.chat_id, await screens[command]())
            return
        if command == "mybookings":
            await self._send(incoming.chat_id, await self._my_bookings(incoming))
            return
        if command == "me":
            await self._send(incoming.chat_id, await self._cabinet(incoming))
            return

        # Всё остальное — свободный вопрос. Отвечать на него будет Елена,
        # а боту достаточно не делать вид, что он понял.
        await self._send(
            incoming.chat_id,
            Screen(
                "Я передам ваш вопрос Елене — она ответит здесь же.\n\n"
                "А пока можно посмотреть маршруты:",
                [[Button("🗺 Экскурсии", "t:list")], [Button("← Меню", "menu")]],
            ),
        )

    async def _on_action(self, incoming: Incoming) -> None:
        action = incoming.action or ""

        if action == "noop":
            return
        if action in ("menu", "about", "t:list"):
            screen = {
                "menu": self._screens.welcome,
                "about": self._screens.about,
                "t:list": self._screens.tours,
            }[action]
            await self._show(incoming, await screen())
            return
        if action == "my:list":
            await self._show(incoming, await self._my_bookings(incoming))
            return
        if action == "me":
            await self._show(incoming, await self._cabinet(incoming))
            return
        if action.startswith("me:"):
            await self._ask_profile(incoming, action[3:])
            return
        if action.startswith("c:"):
            screen, position = await self._screens.carousel(int(action[2:]))
            state = await self._state.read(incoming.chat_id)
            state.carousel = position
            await self._state.write(incoming.chat_id, state)
            await self._show(incoming, screen)
            return
        if action.startswith("fav:"):
            await self._toggle_favorite(incoming, action[4:])
            return
        if action.startswith("t:"):
            await self._show(incoming, await self._screens.tour(action[2:]))
            return
        if action.startswith("b:") or action.startswith("bk:"):
            await self._booking_step(incoming, action)
            return

        await self._show(incoming, await self._screens.welcome())

    # ---- Личный кабинет --------------------------------------------------

    async def _cabinet(self, incoming: Incoming) -> Screen:
        return await self._screens.cabinet(
            ChannelId.TELEGRAM, incoming.chat_id, incoming.display_name
        )

    async def _my_bookings(self, incoming: Incoming) -> Screen:
        return await self._screens.bookings(
            ChannelId.TELEGRAM, incoming.chat_id, incoming.display_name
        )

    async def _ask_profile(self, incoming: Incoming, field: str) -> None:
        prompts = {
            "name": "Как к вам обращаться?",
            "phone": "Пришлите телефон — по нему Елена подтвердит бронь.",
            "email": "Пришлите почту для писем о брони.",
        }
        if field not in prompts:
            return
        state = await self._state.read(incoming.chat_id)
        state.awaiting = field  # type: ignore[assignment]
        await self._state.write(incoming.chat_id, state)
        await self._send(incoming.chat_id, Screen(prompts[field], [[Button("← Кабинет", "me")]]))

    async def _fill_profile(self, incoming: Incoming, state: BotState, value: str) -> None:
        account = await self._accounts.ensure(
            ChannelId.TELEGRAM, incoming.chat_id, incoming.display_name
        )
        field = state.awaiting
        state.awaiting = None
        await self._state.write(incoming.chat_id, state)

        if field == "name":
            account.name = value[:100]
        elif field == "phone":
            from app.domain.schemas.common import normalize_ru_phone

            normalized = normalize_ru_phone(value)
            if normalized is None:
                await self._send(
                    incoming.chat_id,
                    Screen(
                        "Не похоже на телефон. Попробуйте ещё раз.",
                        [[Button("← Кабинет", "me")]],
                    ),
                )
                return
            account.phone = normalized
        elif field == "email":
            if "@" not in value:
                await self._send(
                    incoming.chat_id,
                    Screen(
                        "Не похоже на почту. Попробуйте ещё раз.",
                        [[Button("← Кабинет", "me")]],
                    ),
                )
                return
            account.email = value.strip().lower()[:255]

        await self._send(incoming.chat_id, await self._cabinet(incoming))

    async def _toggle_favorite(self, incoming: Incoming, tour_id: str) -> None:
        account = await self._accounts.ensure(
            ChannelId.TELEGRAM, incoming.chat_id, incoming.display_name
        )
        if await self._uow.favorites.exists_for(account.id, tour_id):
            await self._uow.favorites.remove(account.id, tour_id)
            note = "Убрано из избранного."
        else:
            from app.domain.models.content import Favorite

            self._uow.favorites.add(Favorite(user_id=account.id, tour_id=tour_id))
            note = "Добавлено в избранное — видно и на сайте."
        await self._send(incoming.chat_id, Screen(note, [[Button("← Меню", "menu")]]))

    # ---- Бронирование ----------------------------------------------------

    async def _booking_step(self, incoming: Incoming, action: str) -> None:
        state = await self._state.read(incoming.chat_id)

        if action.startswith("b:"):
            state.booking = Draft(tour_id=action[2:])
            await self._state.write(incoming.chat_id, state)
            await self._show(incoming, await self._when_screen(state.booking))
            return

        draft = state.booking
        if draft is None:
            await self._show(incoming, await self._screens.welcome())
            return

        step = action[3:]
        if step == "d:own":
            # Своя дата: сперва день, потом время. В одну клавиатуру
            # четырнадцать дней на пять часов не помещаются.
            await self._show(incoming, self._days_screen())
            return
        if step.startswith("s:"):
            draft.schedule_id = step[2:]
            draft.desired_date = None
        elif step.startswith("d:"):
            draft.desired_date = step[2:]
            draft.schedule_id = None
        elif step.startswith("t:"):
            # День уже выбран, осталось время. Пояс указываем явно: без
            # него «14:00» прочиталось бы как UTC и уехало на три часа.
            draft.desired_date = f"{draft.desired_date}T{step[2:]}:00+03:00"
        elif step.startswith("p:"):
            draft.people = int(step[2:])
        elif step == "ok":
            await self._confirm(incoming, draft)
            return
        elif step == "cancel":
            state.booking = None
            await self._state.write(incoming.chat_id, state)
            await self._show(incoming, await self._screens.welcome())
            return

        await self._state.write(incoming.chat_id, state)
        await self._show(incoming, await self._next_screen(draft))

    async def _next_screen(self, draft: Draft) -> Screen:
        if not draft.schedule_id and not draft.desired_date:
            return await self._when_screen(draft)
        if draft.desired_date and "T" not in draft.desired_date:
            return self._time_screen()
        if draft.people is None:
            return await self._people_screen(draft)
        return await self._confirm_screen(draft)

    async def _when_screen(self, draft: Draft) -> Screen:
        slots = await self._uow.schedules.upcoming_for_tour(draft.tour_id)
        rows: list[list[Button]] = []
        for slot in slots[:6]:
            label = f"{format_msk(slot.starts_at)} · свободно {slot.free_seats}"
            rows.append([Button(label, f"bk:s:{slot.id}")])

        head = "Выберите дату:" if slots else "Когда вам удобно?"
        rows.append([Button("📅 Своя дата", "bk:d:own")])
        rows.append([Button("✖️ Отмена", "bk:cancel")])
        return Screen(head, rows)

    def _days_screen(self) -> Screen:
        today = datetime.now(UTC).date()
        rows: list[list[Button]] = []
        chunk: list[Button] = []
        for shift in range(1, DAYS_AHEAD + 1):
            day = today + timedelta(days=shift)
            label = f"{day.day} {MONTHS_SHORT[day.month - 1]}"
            chunk.append(Button(label, f"bk:d:{day.isoformat()}"))
            if len(chunk) == 3:
                rows.append(chunk)
                chunk = []
        if chunk:
            rows.append(chunk)
        rows.append([Button("✖️ Отмена", "bk:cancel")])
        return Screen("Какой день подойдёт?", rows)

    def _time_screen(self) -> Screen:
        return Screen(
            "Во сколько начнём?",
            [
                [Button(time, f"bk:t:{time}") for time in TIMES[:3]],
                [Button(time, f"bk:t:{time}") for time in TIMES[3:]],
                [Button("✖️ Отмена", "bk:cancel")],
            ],
        )

    async def _people_screen(self, draft: Draft) -> Screen:
        tour = await self._uow.tours.get(draft.tour_id)
        maximum = (tour.group_max if tour and tour.group_max else 8) or 8
        minimum = tour.group_min if tour else 1

        rows: list[list[Button]] = []
        chunk: list[Button] = []
        for count in range(minimum, maximum + 1):
            chunk.append(Button(str(count), f"bk:p:{count}"))
            if len(chunk) == 4:
                rows.append(chunk)
                chunk = []
        if chunk:
            rows.append(chunk)
        rows.append([Button("✖️ Отмена", "bk:cancel")])
        return Screen("Сколько вас будет?", rows)

    async def _confirm_screen(self, draft: Draft) -> Screen:
        tour = await self._uow.tours.get(draft.tour_id)
        if tour is None:
            return Screen("Экскурсия не найдена.", [[Button("← Меню", "menu")]])

        when = "дата на согласовании"
        if draft.schedule_id:
            slot = await self._uow.schedules.get(draft.schedule_id)
            if slot:
                when = format_msk(slot.starts_at)
        elif draft.desired_date:
            when = format_msk(datetime.fromisoformat(draft.desired_date))

        people = draft.people or 1
        total = tour.price_for(people)
        return Screen(
            "\n".join([
                "Проверьте заявку:",
                "",
                f"Экскурсия: {tour.title}",
                f"Когда: {when}",
                f"Участников: {people}",
                f"Стоимость: {money(total)}",
            ]),
            [
                [Button("✅ Подтвердить", "bk:ok")],
                [Button("✖️ Отмена", "bk:cancel")],
            ],
        )

    async def _confirm(self, incoming: Incoming, draft: Draft) -> None:
        account = await self._accounts.ensure(
            ChannelId.TELEGRAM, incoming.chat_id, incoming.display_name
        )
        if not account.phone:
            await self._send(
                incoming.chat_id,
                Screen(
                    "Для брони нужен телефон — Елена позвонит подтвердить.",
                    [[Button("📞 Указать телефон", "me:phone")], [Button("← Меню", "menu")]],
                ),
            )
            return

        payload = BookingCreate.model_validate({
            "tourId": draft.tour_id,
            "scheduleId": draft.schedule_id,
            "desiredDate": draft.desired_date,
            "peopleCount": draft.people or 1,
            "contactName": account.name,
            "contactPhone": account.phone,
            "contactEmail": account.email,
        })
        created = await self._bookings.create(
            payload, user_id=account.id, source="telegram"
        )

        await self._state.clear(incoming.chat_id)
        await self._send(
            incoming.chat_id,
            Screen(
                "\n".join([
                    "Заявка принята!",
                    "",
                    f"{created.tour.title}",
                    f"Стоимость: {money(created.total_price)}",
                    "",
                    "Елена свяжется с вами для подтверждения.",
                ]),
                [[Button("📋 Мои брони", "my:list")], [Button("← Меню", "menu")]],
            ),
        )

    # ---- Отправка --------------------------------------------------------

    async def _show(self, incoming: Incoming, screen: Screen) -> None:
        """Ответ на нажатие правит то же сообщение, а не плодит новые.

        Иначе после пяти нажатий чат превращается в ленту одинаковых
        карточек, и найти в ней нужную невозможно.
        """
        if not incoming.is_callback or incoming.message_id is None:
            await self._send(incoming.chat_id, screen)
            return

        markup = _keyboard(screen.buttons)
        try:
            if screen.photo:
                await self._api.call(
                    "editMessageMedia",
                    {
                        "chat_id": incoming.chat_id,
                        "message_id": incoming.message_id,
                        "media": {
                            "type": "photo",
                            "media": screen.photo,
                            "caption": screen.text[:1024],
                        },
                        "reply_markup": markup,
                    },
                )
            else:
                await self._api.call(
                    "editMessageText",
                    {
                        "chat_id": incoming.chat_id,
                        "message_id": incoming.message_id,
                        "text": screen.text,
                        "reply_markup": markup,
                    },
                )
        except RuntimeError:
            # Правку не принимают, когда меняется тип сообщения: текст
            # нельзя превратить в фотографию. Тогда старое убираем и
            # отправляем новое — лента всё равно не растёт.
            await self._delete(incoming.chat_id, incoming.message_id)
            await self._send(incoming.chat_id, screen)

    async def _send(self, chat_id: str, screen: Screen) -> None:
        markup = _keyboard(screen.buttons)
        if screen.photo:
            await self._api.call(
                "sendPhoto",
                {
                    "chat_id": chat_id,
                    "photo": screen.photo,
                    # Подпись к фотографии ограничена тысячей знаков.
                    "caption": screen.text[:1024],
                    "reply_markup": markup,
                },
            )
        else:
            await self._api.call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": screen.text,
                    "reply_markup": markup,
                    "disable_web_page_preview": True,
                },
            )

    async def _delete(self, chat_id: str, message_id: int) -> None:
        # Старое сообщение могли удалить вручную — это не ошибка.
        with suppress(RuntimeError):
            await self._api.call(
                "deleteMessage", {"chat_id": chat_id, "message_id": message_id}
            )

    async def _answer_callback(self, callback_id: str | None) -> None:
        if not callback_id:
            return
        # Подтверждение нажатия не критично: если оно не прошло, кнопка
        # просто подольше покрутится, а разговор продолжится.
        with suppress(RuntimeError):
            await self._api.call("answerCallbackQuery", {"callback_query_id": callback_id})


def _keyboard(buttons: list[list[Button]]) -> dict[str, Any] | None:
    if not buttons:
        return None
    return {
        "inline_keyboard": [
            [{"text": button.label, "callback_data": button.action} for button in row]
            for row in buttons
        ]
    }


def _name_of(user: dict[str, Any]) -> str:
    parts = [user.get("first_name"), user.get("last_name")]
    return " ".join(part for part in parts if part).strip() or "Гость"
