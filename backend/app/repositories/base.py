"""Базовый репозиторий.

Слой между моделями и бизнес-логикой: сервис просит «найди», «добавь»,
«посчитай» и не знает, что под ним SQLAlchemy. В прежней версии запросы
Drizzle были размазаны прямо по обработчикам — одно и то же условие
«опубликованная экскурсия по слагу» встречалось в четырёх местах и
расходилось при правках.

Репозиторий намеренно не коммитит: транзакцией распоряжается единица
работы, иначе один сервис мог бы зафиксировать половину операции другого.
"""

from __future__ import annotations

from abc import ABC
from collections.abc import Sequence
from typing import Any, ClassVar

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base


class Repository[ModelT: Base](ABC):
    """Доступ к одной таблице."""

    model: ClassVar[type[Any]]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @property
    def session(self) -> AsyncSession:
        return self._session

    async def get(self, entity_id: str) -> ModelT | None:
        return await self._session.get(self.model, entity_id)

    def add(self, entity: ModelT) -> ModelT:
        """Ставит объект в очередь на запись. Идентификатор уже есть —
        его присваивает модель, а не база, поэтому ждать flush не нужно."""
        self._session.add(entity)
        return entity

    async def delete(self, entity: ModelT) -> None:
        await self._session.delete(entity)

    async def delete_where(self, *conditions: ColumnElement[bool]) -> int:
        """Удаление без выборки — когда объекты нужны только чтобы их убрать."""
        result = await self._session.execute(delete(self.model).where(*conditions))
        return result.rowcount or 0

    async def find_one(self, *conditions: ColumnElement[bool]) -> ModelT | None:
        result = await self._session.execute(select(self.model).where(*conditions).limit(1))
        return result.scalar_one_or_none()

    async def find_many(
        self,
        *conditions: ColumnElement[bool],
        order_by: Sequence[Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ModelT]:
        query = select(self.model)
        if conditions:
            query = query.where(*conditions)
        if order_by:
            query = query.order_by(*order_by)
        if limit is not None:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def count(self, *conditions: ColumnElement[bool]) -> int:
        query = select(func.count()).select_from(self.model)
        if conditions:
            query = query.where(*conditions)
        result = await self._session.execute(query)
        return int(result.scalar_one())

    async def exists(self, *conditions: ColumnElement[bool]) -> bool:
        # limit(1) вместо count(): существование не требует пересчёта всей
        # таблицы, а на больших выборках разница заметна.
        result = await self._session.execute(select(self.model.id).where(*conditions).limit(1))
        return result.first() is not None
