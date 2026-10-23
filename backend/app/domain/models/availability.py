"""Занятость экскурсовода и черновики броней в боте."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IdMixin

#: Часовой пояс экскурсий. Всё, что человек видит как «3 ноября, 14:00», —
#: это московское время, и в базе оно лежит строками именно поэтому:
#: метка времени тут уводила бы край суток на три часа.
TOUR_TIMEZONE = "Europe/Moscow"


class AvailabilityBlock(Base, IdMixin):
    """Закрытые день или часы: отпуск, отъезд, экскурсия с другой площадки.

    Период закрывается отдельной строкой на каждый день — так его легко
    открыть обратно по одному дню и не нужно резать диапазоны при
    пересечениях.
    """

    __tablename__ = "availability_blocks"
    __table_args__ = (Index("availability_blocks_date_idx", "date"),)

    #: ГГГГ-ММ-ДД по московскому времени.
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    #: ЧЧ:ММ по московскому времени; пусто в обоих — закрыт весь день.
    start_time: Mapped[str | None] = mapped_column(String(5))
    end_time: Mapped[str | None] = mapped_column(String(5))
    #: Заметка для себя. Гостям не показывается.
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    @property
    def is_whole_day(self) -> bool:
        return self.start_time is None

    @property
    def start_minutes(self) -> int:
        return _minutes(self.start_time) if self.start_time else 0

    @property
    def end_minutes(self) -> int:
        return _minutes(self.end_time) if self.end_time else 24 * 60

    def overlaps(self, start_minutes: int, end_minutes: int) -> bool:
        """Пересекается ли промежуток с закрытым — в минутах от полуночи."""
        return start_minutes < self.end_minutes and self.start_minutes < end_minutes


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


class BotDraft(Base):
    """Черновик брони, набираемый в боте.

    Бронь собирается за несколько нажатий, а в `callback_data` её не
    сложить: там потолок 64 байта, а один идентификатор слота — уже 36
    символов. Один черновик на чат: параллельных броней не бывает.
    """

    __tablename__ = "bot_drafts"

    chat_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    #: JSON: экскурсия, слот или дата со временем, число участников.
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
