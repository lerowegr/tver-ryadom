"""Что бот помнит про чат между сообщениями.

Состояние шага живёт в таблице черновиков, а не в данных кнопки: у
Telegram там потолок 64 байта, а один идентификатор слота — уже 36
символов. Черновик один на чат: параллельных броней у человека не бывает.

Кроме недособранной брони здесь лежит признак «жду ответа на такое-то
поле кабинета». Без него присланный текст не отличить от вопроса,
адресованного Елене.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from app.core.unit_of_work import UnitOfWork
from app.domain.models.availability import BotDraft

Awaiting = Literal["name", "phone", "email", "photo"]


@dataclass(slots=True)
class Draft:
    """Недособранная бронь."""

    tour_id: str
    schedule_id: str | None = None
    desired_date: str | None = None
    people: int | None = None


@dataclass(slots=True)
class BotState:
    booking: Draft | None = None
    awaiting: Awaiting | None = None
    #: На какой карточке остановилась карусель экскурсий.
    carousel: int = 0
    #: Что ещё показано в чате — чтобы убрать при возврате назад.
    extra_messages: list[int] = field(default_factory=list)

    def to_json(self) -> str:
        payload: dict[str, Any] = {
            "booking": asdict(self.booking) if self.booking else None,
            "awaiting": self.awaiting,
            "carousel": self.carousel,
            "extraMessages": self.extra_messages,
        }
        return json.dumps(payload, ensure_ascii=False)

    @classmethod
    def from_json(cls, raw: str) -> BotState:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return cls()
        if not isinstance(data, dict):
            return cls()

        # Записи первой версии хранили бронь без обёртки — разбираем и такие.
        if "tourId" in data or "tour_id" in data:
            return cls(booking=_draft_from(data))

        booking = data.get("booking")
        return cls(
            booking=_draft_from(booking) if isinstance(booking, dict) else None,
            awaiting=data.get("awaiting"),
            carousel=int(data.get("carousel") or 0),
            extra_messages=[int(x) for x in data.get("extraMessages") or []],
        )


def _draft_from(data: dict[str, Any]) -> Draft | None:
    tour_id = data.get("tour_id") or data.get("tourId")
    if not tour_id:
        return None
    return Draft(
        tour_id=str(tour_id),
        schedule_id=data.get("schedule_id") or data.get("scheduleId"),
        desired_date=data.get("desired_date") or data.get("desiredDate"),
        people=data.get("people"),
    )


class StateStore:
    """Чтение и запись состояния чата."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def read(self, chat_id: str) -> BotState:
        row = await self._uow.session.get(BotDraft, chat_id)
        return BotState.from_json(row.payload) if row else BotState()

    async def write(self, chat_id: str, state: BotState) -> None:
        row = await self._uow.session.get(BotDraft, chat_id)
        if row is None:
            self._uow.session.add(BotDraft(chat_id=chat_id, payload=state.to_json()))
        else:
            row.payload = state.to_json()

    async def clear(self, chat_id: str) -> None:
        row = await self._uow.session.get(BotDraft, chat_id)
        if row is not None:
            await self._uow.session.delete(row)
