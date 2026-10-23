"""Занятость экскурсовода: закрытые дни и часы.

Всё считается в московском «стенном» времени. Закрытие «3 ноября» означает
сутки в Твери, а не сутки от полуночи UTC: иначе край дня уезжал бы на три
часа и вечер третьего оставался бы открытым для записи.

Пояс берётся из базы часовых поясов, а не задаётся как «+3 часа». Сейчас в
России нет перехода на летнее время, но вшивать это допущение в код,
который распоряжается чужим расписанием, не стоит.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.errors import ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.availability import AvailabilityBlock
from app.domain.schemas.availability import (
    AvailabilityBlockCreate,
    AvailabilityBlockOut,
    PublicBlock,
)

MSK = ZoneInfo("Europe/Moscow")

#: Больше полугода одним махом не закрываем: это уже не отпуск, а пауза
#: в работе, и закрывать её стоит осознанно.
MAX_DAYS = 185

MINUTES_IN_DAY = 24 * 60


@dataclass(frozen=True, slots=True)
class WallClock:
    """Дата и время так, как их видит человек в Твери."""

    date: str
    time: str

    @property
    def minutes(self) -> int:
        return _minutes(self.time)


def to_msk_wall_clock(moment: datetime) -> WallClock:
    local = moment.astimezone(MSK)
    return WallClock(date=local.strftime("%Y-%m-%d"), time=local.strftime("%H:%M"))


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _scale(date: str, minutes: int) -> int:
    """Сквозная шкала минут.

    Нужна, чтобы сравнивать промежутки, переходящие через полночь: иначе
    экскурсия с 23:00 до 01:00 «заканчивалась» раньше, чем начиналась.
    """
    day = datetime.fromisoformat(date).replace(tzinfo=UTC)
    return int(day.timestamp() // 60) + minutes


def enumerate_days(start: str, end: str) -> list[str]:
    days: list[str] = []
    cursor = datetime.fromisoformat(start).replace(tzinfo=UTC)
    last = datetime.fromisoformat(end).replace(tzinfo=UTC)
    while cursor <= last:
        days.append(cursor.strftime("%Y-%m-%d"))
        if len(days) > MAX_DAYS:
            break
        cursor += timedelta(days=1)
    return days


class AvailabilityService:
    """Чтение и правка занятости, а также главный вопрос: свободно ли время."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    # ---- Чтение ----------------------------------------------------------

    async def list_public(self, start: str, end: str) -> list[PublicBlock]:
        """Для формы бронирования: только даты и часы.

        Пометки вроде «отпуск» или «экскурсия со Спутника» — заметки для
        себя, и гостям их видеть незачем.
        """
        blocks = await self._uow.availability.in_range(start, end)
        return [
            PublicBlock(date=b.date, start_time=b.start_time, end_time=b.end_time)
            for b in blocks
        ]

    async def list_admin(self, start: str, end: str) -> list[AvailabilityBlockOut]:
        blocks = await self._uow.availability.in_range(start, end)
        return [AvailabilityBlockOut.model_validate(block) for block in blocks]

    # ---- Правка ----------------------------------------------------------

    async def close(self, data: AvailabilityBlockCreate) -> list[AvailabilityBlockOut]:
        """Закрывает период.

        На каждый день заводится своя строка: так период легко открыть
        обратно по одному дню и не нужно резать диапазоны при пересечениях.
        """
        days = enumerate_days(data.from_date, data.to_date)
        if len(days) > MAX_DAYS:
            raise ValidationError(f"За один раз можно закрыть не больше {MAX_DAYS} дней")

        for date in days:
            self._uow.availability.add(
                AvailabilityBlock(
                    date=date,
                    start_time=data.start_time,
                    end_time=data.end_time,
                    note=data.note,
                )
            )
        await self._uow.flush()
        return await self.list_admin(data.from_date, data.to_date)

    async def open_day(self, date: str) -> None:
        """Открывает день целиком — и «весь день», и промежутки внутри него."""
        await self._uow.availability.delete_day(date)

    async def remove(self, block_id: str) -> None:
        block = await self._uow.availability.get(block_id)
        if block is not None:
            await self._uow.availability.delete(block)

    # ---- Главный вопрос --------------------------------------------------

    async def is_blocked(self, starts_at: datetime, duration_minutes: int) -> bool:
        """Попадает ли экскурсия в закрытое время.

        Сравнивается не момент начала, а весь промежуток: если на 15:00
        назначена чужая экскурсия, двухчасовая прогулка с 14:00 всё равно
        накладывается. Пропустить такую — худший исход: накладка вскроется
        в день выезда.
        """
        start = to_msk_wall_clock(starts_at)
        finish = to_msk_wall_clock(starts_at + timedelta(minutes=duration_minutes))

        begins = _scale(start.date, start.minutes)
        ends = begins + duration_minutes

        blocks = await self._uow.availability.in_range(start.date, finish.date)
        for block in blocks:
            block_from = _scale(block.date, block.start_minutes)
            block_to = _scale(block.date, block.end_minutes)
            if begins < block_to and block_from < ends:
                return True
        return False
