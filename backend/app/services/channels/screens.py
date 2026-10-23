"""Экраны бота, не знающие про транспорт.

Telegram рисует карточки с фотографиями, у ВКонтакте и MAX своя разметка
клавиатур. Общее у них одно — что показать. Здесь только текст, список
кнопок и, если есть, картинка; как это отправить, решает адаптер канала.

Тексты приветствия и «про экскурсии» берутся из тех же настроек, что
показывает сайт. Копия в коде немедленно начала бы отставать: Елена
правит их в админке.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.unit_of_work import UnitOfWork
from app.domain.models.bookings import Booking
from app.domain.models.content import Setting
from app.domain.models.tours import Schedule, Tour
from app.services.channels.accounts import CHANNEL_LABELS, AccountService, ChannelId
from app.services.notifications.templates import format_msk

TAGS = re.compile(r"<[^>]+>")


def plain(value: str) -> str:
    """Во ВКонтакте и MAX разметки нет — теги Telegram убираем."""
    return TAGS.sub("", value)


def money(kopecks: int) -> str:
    return f"{kopecks // 100:,}".replace(",", " ") + " ₽"


def hours(minutes: int) -> str:
    value = round(minutes / 60, 1)
    text = f"{value:g}".replace(".", ",")
    return f"{text} ч"


@dataclass(frozen=True, slots=True)
class Button:
    label: str
    #: Действие — тот же словарь, что у кнопок Telegram.
    action: str


@dataclass(slots=True)
class Screen:
    text: str
    buttons: list[list[Button]] = field(default_factory=list)
    #: Адрес картинки, если экран её показывает.
    photo: str | None = None


MENU_BUTTONS: list[list[Button]] = [
    [Button("🗺 Экскурсии", "t:list")],
    [Button("📋 Мои брони", "my:list"), Button("👤 Кабинет", "me")],
    [Button("ℹ️ Про экскурсии", "about")],
]

BACK_TO_MENU = [Button("← Меню", "menu")]


class ScreenBuilder:
    """Собирает экраны. Один на все каналы."""

    def __init__(self, uow: UnitOfWork, *, images_base: str | None = None) -> None:
        self._uow = uow
        self._images_base = images_base
        self._accounts = AccountService(uow)

    # ---- Настройки -------------------------------------------------------

    async def settings(self) -> dict[str, object]:
        rows = await self._uow.session.execute(select(Setting))
        return {row.key: row.value for row in rows.scalars().all()}

    # ---- Содержательные экраны ------------------------------------------

    async def welcome(self) -> Screen:
        """Приветствие от лица Елены, а не «сервиса»: экскурсии у неё
        авторские, и первое сообщение задаёт тон всему разговору."""
        config = await self.settings()
        tagline = _text(config.get("company.tagline")) or "Авторские экскурсии по Твери"
        return Screen(
            text="\n".join([
                "Здравствуйте! Меня зовут Елена Громова, "
                "я аттестованный экскурсовод по Твери.",
                "",
                tagline,
                "",
                "Здесь можно посмотреть маршруты с фотографиями, забронировать "
                "прогулку в несколько нажатий и следить за своими бронями. "
                "Если проще спросить словами — просто напишите мне сюда.",
            ]),
            buttons=MENU_BUTTONS,
        )

    async def about(self) -> Screen:
        """Формат считается по самим экскурсиям: цены и длительность
        меняются в админке, и записанный руками текст начал бы врать."""
        config = await self.settings()
        intro = _text(config.get("about.intro"))

        tours = await self._published()
        lines = ["Про экскурсии", ""]
        if intro:
            lines += [intro, ""]

        if tours:
            prices = [tour.price for tour in tours]
            durations = [tour.duration_minutes for tour in tours]
            lines += [
                f"Сейчас доступно маршрутов: {len(tours)}.",
                f"Стоимость — от {money(min(prices))} до {money(max(prices))}.",
                f"Длительность — от {hours(min(durations))} до {hours(max(durations))}.",
                "",
                "Группы небольшие, маршрут подстраивается под темп и интересы.",
            ]
        else:
            lines.append("Маршруты скоро появятся.")

        return Screen(
            text="\n".join(lines),
            buttons=[[Button("🗺 Экскурсии", "t:list")], BACK_TO_MENU],
        )

    # ---- Экскурсии -------------------------------------------------------

    async def tours(self) -> Screen:
        tours = await self._published()
        if not tours:
            return Screen("Экскурсий пока нет — загляните позже.", [BACK_TO_MENU])

        blocks = []
        for tour in tours:
            per = "за человека" if tour.price_type == "per_person" else "за группу"
            blocks.append(
                f"• {tour.title}\n  {money(tour.price)} {per}, "
                f"{hours(tour.duration_minutes)}\n  {tour.short_description}"
            )

        buttons = [[Button(tour.title[:38], f"t:{tour.id}")] for tour in tours]
        buttons.append(BACK_TO_MENU)
        return Screen("Маршруты:\n\n" + "\n\n".join(blocks), buttons)

    async def tour(self, tour_id: str, *, position: int | None = None) -> Screen:
        tour = await self._uow.tours.published_with_media(tour_id)
        if tour is None:
            return Screen("Экскурсия не найдена.", [BACK_TO_MENU])

        route = ""
        if tour.route_points:
            points = sorted(tour.route_points, key=lambda p: p.sort_order)
            route = "\n\nМаршрут:\n" + "\n".join(
                f"{index + 1}. {point.title}" for index, point in enumerate(points)
            )

        per = "за человека" if tour.price_type == "per_person" else "за группу"
        head = f"{tour.title}\n{money(tour.price)} {per} · {hours(tour.duration_minutes)}"
        # Telegram обрывает подпись к фотографии, поэтому держим запас.
        text = f"{head}\n\n{tour.full_description}{route}"[:3800]

        rows: list[list[Button]] = [[Button("📅 Забронировать", f"b:{tour.id}")]]
        if position is not None:
            rows.append([
                Button("←", f"c:{position - 1}"),
                Button(f"{position + 1}", "noop"),
                Button("→", f"c:{position + 1}"),
            ])
        rows.append([Button("⭐️ В избранное", f"fav:{tour.id}")])
        rows.append([Button("← К списку", "t:list"), Button("← Меню", "menu")])

        return Screen(text=text, buttons=rows, photo=self._photo_of(tour))

    async def carousel(self, index: int) -> tuple[Screen, int]:
        """Карточка по порядковому номеру. Список закольцован: с последней
        вправо попадаешь на первую, и тупика в карусели не возникает."""
        tours = await self._published()
        if not tours:
            return Screen("Экскурсий пока нет — загляните позже.", [BACK_TO_MENU]), 0
        position = index % len(tours)
        return await self.tour(tours[position].id, position=position), position

    # ---- Личное ----------------------------------------------------------

    async def bookings(self, channel: ChannelId, external_id: str, name: str) -> Screen:
        account = await self._accounts.ensure(channel, external_id, name)
        now = datetime.now(UTC)

        future = select(Schedule.id).where(Schedule.starts_at > now)
        rows = await self._uow.session.execute(
            select(Booking)
            .where(
                Booking.user_id == account.id,
                Booking.status.in_(("pending", "confirmed")),
                Booking.schedule_id.in_(future) | (Booking.desired_date > now),
            )
            .limit(20)
            # Название экскурсии и дата слота нужны каждой строке списка.
            .options(selectinload(Booking.tour), selectinload(Booking.schedule))
        )
        found = list(rows.scalars().all())
        if not found:
            return Screen(
                "Предстоящих экскурсий нет.",
                [[Button("🗺 Выбрать экскурсию", "t:list")], BACK_TO_MENU],
            )

        lines = []
        for booking in sorted(found, key=lambda b: b.starts_at or now):
            mark = "✅" if booking.status == "confirmed" else "🕐"
            title = booking.tour.title if booking.tour else "Экскурсия"
            if booking.starts_at:
                when = format_msk(booking.starts_at)
                if booking.schedule_id is None:
                    when += " (дата на согласовании)"
            else:
                when = "дата согласовывается"
            lines.append(
                f"{mark} {title}\n  {when} · {booking.people_count} чел. · "
                f"{money(booking.total_price)}"
            )

        return Screen("Ваши брони:\n\n" + "\n\n".join(lines), [BACK_TO_MENU])

    async def cabinet(self, channel: ChannelId, external_id: str, name: str) -> Screen:
        account = await self._accounts.ensure(channel, external_id, name)
        linked = await self._accounts.linked_channels(account.id)
        return Screen(
            text="\n".join([
                "Личный кабинет",
                "",
                f"Имя: {account.name}",
                f"Телефон: {account.phone or 'не указан'}",
                f"Почта: {account.email or 'не указана'}",
                f"Каналы: {', '.join(CHANNEL_LABELS[c] for c in linked) or 'только этот'}",
                "",
                "Эти же данные видны на сайте и в других мессенджерах — запись одна.",
            ]),
            buttons=[
                [Button("✏️ Имя", "me:name"), Button("📞 Телефон", "me:phone")],
                [Button("✉️ Почта", "me:email")],
                [Button("📋 Мои брони", "my:list")],
                BACK_TO_MENU,
            ],
        )

    # ---- Разбор действия -------------------------------------------------

    async def screen_for(
        self, action: str, channel: ChannelId, external_id: str, name: str
    ) -> Screen:
        """Действие кнопки в экран. Общий разбор для ВКонтакте и MAX;
        у Telegram свой, там есть фотографии и карусель."""
        if action == "about":
            return await self.about()
        if action == "t:list":
            return await self.tours()
        if action == "my:list":
            return await self.bookings(channel, external_id, name)
        if action == "me":
            return await self.cabinet(channel, external_id, name)
        if action.startswith("t:"):
            return await self.tour(action[2:])
        return await self.welcome()

    # ---- Вспомогательное -------------------------------------------------

    async def _published(self) -> list[Tour]:
        return await self._uow.tours.find_many(
            Tour.status == "published", order_by=[Tour.sort_order.asc(), Tour.title.asc()]
        )

    def _photo_of(self, tour: Tour) -> str | None:
        if not self._images_base or not tour.images:
            return None
        image = sorted(tour.images, key=lambda i: i.sort_order)[0]
        variants = image.variants or {}
        key = variants.get("hero") or variants.get("card") or image.r2_key
        return f"{self._images_base.rstrip('/')}/{key}"


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
