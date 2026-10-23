"""Подключение к базе.

На Workers базу отдавала платформа: `c.env.DB`, одна привязка, никакого
пула. Здесь соединениями управляем сами, поэтому движок и фабрика сессий
собраны в один объект — его создаёт приложение на старте и закрывает на
остановке, а тесты подменяют своим.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    """Общий предок моделей."""


class UtcDateTime(TypeDecorator[datetime]):
    """Время, которое всегда приходит обратно с поясом UTC.

    PostgreSQL отдаёт timestamptz с поясом, SQLite — без него. Код,
    сравнивающий отданное базой время с `datetime.now(UTC)`, работал бы
    на проде и падал в тестах с «can't compare offset-naive and
    offset-aware». Проще один раз привести тип, чем помнить об этом
    в каждом сравнении.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        # Наивное время считаем московским? Нет: по всему коду оно UTC,
        # а местное время живёт отдельными строками в занятости.
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def new_id() -> str:
    """Идентификаторы остаются строковыми UUID — как в прежней базе."""
    return str(uuid.uuid4())


class IdMixin:
    """Первичный ключ. Строка, а не UUID-тип: так переносятся старые записи."""

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)


class TimestampMixin:
    """Отметки времени. Всегда с поясом: иначе сравнение с `now()` врёт."""

    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class Database:
    """Движок и фабрика сессий."""

    def __init__(self, url: str, *, echo: bool = False, **engine_options: object) -> None:
        # pool_pre_ping: соединение могло умереть, пока запросов не было;
        # без проверки первый же запрос после простоя падал бы с разорванным
        # сокетом. Остальное отдаётся наружу — тестам нужен свой пул, иначе
        # база в памяти у каждого соединения оказывается своя.
        options: dict[str, object] = {"echo": echo, "pool_pre_ping": True}
        options.update(engine_options)
        self._engine: AsyncEngine = create_async_engine(url, **options)  # type: ignore[arg-type]
        self._session_factory = async_sessionmaker(
            self._engine,
            expire_on_commit=False,
            # Иначе после commit() любое обращение к полю объекта лезет в базу
            # повторным запросом — а объект к этому моменту уже уехал в ответ.
        )

    @property
    def engine(self) -> AsyncEngine:
        return self._engine

    @property
    def session_factory(self) -> async_sessionmaker[AsyncSession]:
        return self._session_factory

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._session_factory() as session:
            yield session

    async def create_all(self) -> None:
        """Создаёт схему без Alembic — для тестов и первого локального старта."""
        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def dispose(self) -> None:
        await self._engine.dispose()
