"""Общая оснастка тестов.

База — SQLite в памяти, как и в прежней версии на Vitest: тесты должны
идти за секунды и не требовать поднятого Postgres. Схема строится из тех
же моделей, поэтому расхождение «работает на SQLite, падает на Postgres»
возможно только там, где код лезет в диалектные возможности, — а он не лезет.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.database import Database
from app.core.security import Pbkdf2PasswordHasher
from app.domain.models.auth import User
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="тестовый-секрет-достаточной-длины",
        cors_origins=["http://localhost:3000"],
        telegram_bot_token="123456:AAF-fake-token-for-tests",
    )


@pytest.fixture
async def database(settings: Settings) -> AsyncIterator[Database]:
    # StaticPool: иначе каждое соединение открывает свою пустую базу в памяти
    # и созданные таблицы пропадают между запросами.
    db = Database(
        str(settings.database_url),
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        pool_pre_ping=False,
    )
    await db.create_all()
    yield db
    await db.dispose()


@pytest.fixture
async def client(settings: Settings, database: Database) -> AsyncIterator[AsyncClient]:
    app = create_app(settings, database=database)
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as http:
        # lifespan у ASGITransport не запускается, поэтому состояние
        # приложения выставляем здесь — ровно то же, что ставит lifespan.
        app.state.settings = settings
        app.state.database = database
        yield http


@pytest.fixture
async def user_factory(database: Database):
    """Создаёт пользователя напрямую в базе, минуя регистрацию."""
    hasher = Pbkdf2PasswordHasher()

    async def create(
        *,
        email: str = "guest@example.com",
        password: str | None = "Пароль-12345",
        name: str = "Гость",
        role: str = "user",
        telegram_chat_id: str | None = None,
    ) -> User:
        async with database.session() as session:
            user = User(
                email=email,
                name=name,
                role=role,  # type: ignore[arg-type]
                password_hash=hasher.hash(password) if password else None,
                telegram_chat_id=telegram_chat_id,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user

    return create


def body(response) -> dict:
    """Тело ответа. Отдельной функцией — чтобы в тестах не повторять .json()."""
    return response.json()
