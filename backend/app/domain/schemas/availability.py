"""Схемы занятости экскурсовода.

Время здесь — местное московское, строками. Метка времени была бы ловушкой:
«закрыть 3 ноября» означает сутки в Твери, а при пересчёте в UTC край дня
уезжает на три часа.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from app.domain.schemas.common import CamelSchema, Schema

#: ГГГГ-ММ-ДД по московскому времени.
MskDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
#: ЧЧ:ММ по московскому времени.
MskTime = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class AvailabilityRange(Schema):
    # `from` — ключевое слово Python, поэтому поле названо иначе,
    # а наружу уходит под прежним именем.
    from_date: MskDate = Field(alias="from")
    to_date: MskDate = Field(alias="to")

    @model_validator(mode="after")
    def _check_order(self) -> Self:
        if self.to_date < self.from_date:
            raise ValueError("Конец периода раньше начала")
        return self


class AvailabilityBlockCreate(AvailabilityRange):
    """Закрытие периода. Один запрос закрывает сразу несколько дней:
    набирать отпуск по одному дню было бы издевательством."""

    #: Пусто в обоих полях — закрыт весь день.
    start_time: MskTime | None = Field(default=None, alias="startTime")
    end_time: MskTime | None = Field(default=None, alias="endTime")
    note: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check_times(self) -> Self:
        if bool(self.start_time) != bool(self.end_time):
            raise ValueError("Укажите и начало, и конец промежутка — либо закройте весь день")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("Конец промежутка раньше начала")
        return self


class PublicBlock(CamelSchema):
    """Что видит форма бронирования: только когда занято, без причин."""

    date: str
    start_time: str | None
    end_time: str | None


class AvailabilityBlockOut(CamelSchema):
    """То же плюс заметка — для админки."""

    id: str
    date: str
    start_time: str | None
    end_time: str | None
    note: str | None
    created_at: datetime
