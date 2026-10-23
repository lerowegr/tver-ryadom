"""Лента iCalendar для Google, Apple и Outlook.

Елена подписывает на неё свой календарь, и занятость появляется там сама.
Формат описан в RFC 5545, и две его тонкости стоят отдельного внимания:
строки переносятся по 75 **октетов**, а не символов, и разделитель строк —
обязательно CRLF. На русском тексте первое особенно важно: в UTF-8 буква
занимает два байта, и наивная резка по длине строки порвала бы букву
пополам.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from app.core.unit_of_work import UnitOfWork
from app.domain.models.content import Setting
from app.domain.schemas.admin import CalendarEntry

#: Ключ настройки, под которым лежит секрет ленты.
TOKEN_KEY = "calendar.feedToken"

#: Предел строки по стандарту.
LINE_OCTETS = 75

STATUS_RU = {
    "pending": "ожидает подтверждения",
    "confirmed": "подтверждена",
    "completed": "завершена",
    "cancelled": "отменена",
    "open": "открыт",
    "closed": "закрыт",
}


def stamp(moment: datetime) -> str:
    """«2026-09-06 09:00 UTC» → «20260906T090000Z»."""
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def escape_text(value: str) -> str:
    """Служебные символы iCalendar, перевод строки — как «\\n»."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold(line: str) -> str:
    """Складывает длинную строку, считая байты и не разрывая букву.

    Продолжение начинается с пробела, поэтому на него остаётся 74 октета,
    а не 75.
    """
    if len(line.encode("utf-8")) <= LINE_OCTETS:
        return line

    parts: list[str] = []
    current = ""
    used = 0
    limit = LINE_OCTETS

    for char in line:
        size = len(char.encode("utf-8"))
        if used + size > limit:
            parts.append(current)
            current = " "
            used = 1
            limit = LINE_OCTETS - 1
        current += char
        used += size
    parts.append(current)
    return "\r\n".join(parts)


class IcsBuilder:
    """Собирает ленту из событий календаря."""

    def __init__(self, origin: str) -> None:
        self._origin = origin

    def build(self, entries: list[CalendarEntry], *, now: datetime | None = None) -> str:
        moment = now or datetime.now(UTC)
        lines: list[str] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Тверь рядом//Календарь занятости//RU",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:Тверь рядом — экскурсии",
            "NAME:Тверь рядом — экскурсии",
            "X-WR-TIMEZONE:Europe/Moscow",
            # Подсказка подписчику, как часто перечитывать ленту.
            "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
            "X-PUBLISHED-TTL:PT1H",
        ]
        for entry in entries:
            lines.extend(self._event(entry, moment))
        lines.append("END:VCALENDAR")
        # Стандарт требует именно CRLF, и завершающий перевод тоже.
        return "\r\n".join(lines) + "\r\n"

    def _event(self, entry: CalendarEntry, now: datetime) -> list[str]:
        end = entry.starts_at + timedelta(minutes=entry.duration_minutes)
        lines = [
            "BEGIN:VEVENT",
            f"UID:{entry.kind}-{entry.id}@tver-ryadom",
            f"DTSTAMP:{stamp(now)}",
            f"DTSTART:{stamp(entry.starts_at)}",
            f"DTEND:{stamp(end)}",
        ]

        if entry.kind == "slot":
            lines.append(
                fold(
                    "SUMMARY:"
                    + escape_text(f"{entry.tour_title} — {entry.booked}/{entry.capacity}")
                )
            )
            guests = (
                "\n".join(
                    f"{guest.name}, {guest.people} чел., {guest.phone} "
                    f"({STATUS_RU.get(guest.status, guest.status)})"
                    for guest in entry.guests
                )
                if entry.guests
                else "Записей пока нет"
            )
            status_ru = STATUS_RU.get(entry.status, entry.status)
            lines.append(
                fold(
                    "DESCRIPTION:"
                    + escape_text(f"Слот расписания ({status_ru})\n{guests}")
                )
            )
            lines.append(
                "STATUS:CANCELLED" if entry.status == "cancelled" else "STATUS:CONFIRMED"
            )
        else:
            lines.append(
                fold(
                    "SUMMARY:"
                    + escape_text(f"Заявка: {entry.tour_title} — {entry.people} чел.")
                )
            )
            status_ru = STATUS_RU.get(entry.status, entry.status)
            lines.append(
                fold(
                    "DESCRIPTION:"
                    + escape_text(
                        f"{entry.contact_name}, {entry.contact_phone}\nСтатус: {status_ru}"
                    )
                )
            )
            lines.append(
                "STATUS:TENTATIVE" if entry.status == "pending" else "STATUS:CONFIRMED"
            )

        if entry.meeting_point:
            lines.append(fold("LOCATION:" + escape_text(entry.meeting_point)))
        lines.append(fold(f"URL:{self._origin}"))
        lines.append("END:VEVENT")
        return lines


class FeedTokenService:
    """Секрет в адресе ленты.

    Ссылка и есть пароль: у кого она есть, тот видит расписание и контакты
    гостей. Поэтому секрет длинный, а при утечке его меняют — старая
    ссылка перестаёт работать сразу.
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def read(self) -> str | None:
        setting = await self._uow.session.get(Setting, TOKEN_KEY)
        value = setting.value if setting else None
        return value if isinstance(value, str) else None

    async def ensure(self) -> str:
        existing = await self.read()
        if existing:
            return existing
        return await self._write(self._new_token())

    async def rotate(self) -> str:
        return await self._write(self._new_token())

    async def _write(self, token: str) -> str:
        setting = await self._uow.session.get(Setting, TOKEN_KEY)
        if setting is None:
            self._uow.session.add(Setting(key=TOKEN_KEY, value=token))
        else:
            setting.value = token
        return token

    @staticmethod
    def _new_token() -> str:
        return secrets.token_hex(24)
