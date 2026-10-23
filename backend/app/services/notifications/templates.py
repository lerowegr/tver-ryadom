"""Шаблоны уведомлений.

`text` идёт в Telegram (его разметка HTML), `subject` и `html` — в письмо.
Данные приходят из очереди в том виде, в каком их положил сервис.

Экранирование делается здесь, на отрисовке, а не при записи: в базе должно
лежать то, что человек действительно написал. Иначе один и тот же текст
экранировался бы дважды и в письме появлялось бы «&amp;amp;».
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape
from typing import Any, Protocol

from app.services.availability import MSK

MONTHS = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def format_msk(moment: datetime) -> str:
    """«3 ноября, 14:00» — всегда по московскому времени."""
    local = moment.astimezone(MSK)
    return f"{local.day} {MONTHS[local.month - 1]}, {local:%H:%M}"


def esc(value: Any) -> str:
    return escape(str(value), quote=False)


@dataclass(frozen=True, slots=True)
class RenderedMessage:
    text: str
    subject: str
    html: str


class Renderer(Protocol):
    def __call__(self, payload: dict[str, Any]) -> RenderedMessage: ...


def _booking_lines(payload: dict[str, Any]) -> list[str]:
    fields = (
        ("Экскурсия", payload.get("tourTitle")),
        ("Дата", payload.get("startsAt")),
        ("Участников", payload.get("peopleCount")),
        ("Стоимость", payload.get("totalPriceLabel")),
    )
    return [f"{label}: {esc(value)}" for label, value in fields if value]


def _wrap(title: str, body_html: str, site_url: str | None = None) -> str:
    link = (
        f'<p style="margin-top:20px"><a href="{esc(site_url)}/account/bookings" '
        f'style="color:#a65832">Мои брони на сайте →</a></p>'
        if site_url
        else ""
    )
    return (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;'
        'padding:24px;background:#fbf9f4;border-radius:16px;color:#2a2014">'
        '<p style="font-size:20px;font-weight:bold;margin:0 0 4px">'
        'Тверь <em style="color:#a65832">рядом</em></p>'
        f'<h2 style="font-size:17px;margin:16px 0 8px">{esc(title)}</h2>'
        f"{body_html}{link}"
        '<p style="color:#8a6d4f;font-size:12px;margin-top:24px">'
        "Если вы не оставляли заявку — просто игнорируйте это письмо.</p>"
        "</div>"
    )


def _booking_html(payload: dict[str, Any]) -> str:
    return f'<p style="line-height:1.7;margin:0">{"<br>".join(_booking_lines(payload))}</p>'


def _site_url(payload: dict[str, Any]) -> str | None:
    value = payload.get("siteUrl")
    return value if isinstance(value, str) else None


def _booking_template(
    *, subject: str, title: str, lead: str, tail: str = ""
) -> Renderer:
    """Большинство шаблонов отличаются только заголовком и подписью."""

    def render(payload: dict[str, Any]) -> RenderedMessage:
        lines = "\n".join(_booking_lines(payload))
        comment = payload.get("comment")
        comment_text = f"\n\nКомментарий: {esc(comment)}" if comment else ""
        comment_html = f"<p>Комментарий: {esc(comment)}</p>" if comment else ""
        return RenderedMessage(
            text=f"{lead} <b>{esc(title)}</b>\n\n{lines}{comment_text}\n\n{tail}".strip(),
            subject=subject,
            html=_wrap(
                title,
                f"{_booking_html(payload)}{comment_html}"
                + (f"<p>{esc(tail)}</p>" if tail else ""),
                _site_url(payload),
            ),
        )

    return render


def _completed(payload: dict[str, Any]) -> RenderedMessage:
    title = payload.get("tourTitle")
    praise = f"«{esc(title)}» — надеемся, вам понравилось." if title else ""
    return RenderedMessage(
        text=f"💛 <b>Спасибо, что гуляли с нами!</b>\n\n{praise}\nБудем благодарны за отзыв.",
        subject="Спасибо за прогулку!",
        html=_wrap(
            "Спасибо за прогулку!",
            f"<p>{praise}<br>Будем благодарны за отзыв на сайте.</p>",
            _site_url(payload),
        ),
    )


def _admin_new_booking(payload: dict[str, Any]) -> RenderedMessage:
    lines = "\n".join(_booking_lines(payload))
    who = f"{esc(payload.get('contactName') or '—')}, {esc(payload.get('contactPhone') or '—')}"
    comment = payload.get("comment")
    comment_text = f"\nКомментарий: {esc(comment)}" if comment else ""
    return RenderedMessage(
        text=f"🆕 <b>Новая заявка</b>\n\n{lines}\nКлиент: {who}{comment_text}",
        subject="Новая заявка на бронирование",
        html=_wrap("Новая заявка", _booking_html(payload)),
    )


def _admin_request(payload: dict[str, Any]) -> RenderedMessage:
    phone = payload.get("contactPhone")
    who = esc(payload.get("contactName") or "—") + (f", {esc(phone)}" if phone else "")
    message = esc(payload.get("message") or "")
    return RenderedMessage(
        text=f"✉️ <b>Сообщение с сайта</b>\n\nОт: {who}\n\n{message}",
        subject="Новое сообщение с формы обратной связи",
        html=_wrap("Сообщение с сайта", f"<p>{message}</p>"),
    )


TEMPLATES: dict[str, Renderer] = {
    "booking_created": _booking_template(
        subject="Заявка на экскурсию принята",
        title="Заявка принята!",
        lead="🌿",
        tail="Мы свяжемся с вами для подтверждения.",
    ),
    "booking_confirmed": _booking_template(
        subject="Бронирование подтверждено",
        title="Бронирование подтверждено!",
        lead="✅",
        tail="Ждём вас! Если планы изменятся — напишите нам.",
    ),
    "booking_cancelled": _booking_template(
        subject="Бронирование отменено",
        title="Бронирование отменено",
        lead="❌",
        tail="Будем рады видеть вас в другой раз.",
    ),
    "booking_reminder": _booking_template(
        subject="Напоминание: завтра экскурсия",
        title="Напоминаем: завтра экскурсия!",
        lead="⏰",
        tail="До встречи!",
    ),
    "booking_completed": _completed,
    "admin_new_booking": _admin_new_booking,
    "admin_booking_cancelled": _booking_template(
        subject="Клиент отменил бронирование",
        title="Клиент отменил бронь",
        lead="↩️",
    ),
    "admin_new_request": _admin_request,
}


def render(template: str, payload: dict[str, Any] | None) -> RenderedMessage:
    """Неизвестный шаблон не роняет доставку.

    Сообщение всё равно уйдёт — пусть неказистое, но человек узнает, что
    что-то произошло. Потерять уведомление из-за опечатки в имени хуже.
    """
    data = payload or {}
    renderer = TEMPLATES.get(template)
    if renderer is None:
        body = esc(", ".join(f"{key}: {value}" for key, value in data.items()))
        return RenderedMessage(
            text=f"<b>Уведомление</b>\n\n{body}",
            subject="Уведомление",
            html=_wrap("Уведомление", f"<p>{body}</p>"),
        )
    return renderer(data)
