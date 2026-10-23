"""Репозиторий занятости."""

from __future__ import annotations

from app.domain.models.availability import AvailabilityBlock
from app.repositories.base import Repository


class AvailabilityRepository(Repository[AvailabilityBlock]):
    model = AvailabilityBlock

    async def in_range(self, start: str, end: str) -> list[AvailabilityBlock]:
        # Даты лежат строками ГГГГ-ММ-ДД, и такое сравнение совпадает
        # с календарным порядком — отдельный тип здесь ничего не добавил бы.
        return await self.find_many(
            AvailabilityBlock.date >= start,
            AvailabilityBlock.date <= end,
            order_by=[AvailabilityBlock.date.asc(), AvailabilityBlock.start_time.asc()],
        )

    async def delete_day(self, date: str) -> int:
        return await self.delete_where(AvailabilityBlock.date == date)
