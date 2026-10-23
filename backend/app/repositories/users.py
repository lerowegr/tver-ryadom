"""Репозитории пользователей и сессий."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select

from app.domain.models.auth import Session, User
from app.repositories.base import Repository


class UserRepository(Repository[User]):
    model = User

    async def by_email(self, email: str) -> User | None:
        """Поиск без учёта регистра: «Elena@» и «elena@» — один человек,
        и регистрация вторым написанием создавала бы двойника."""
        return await self.find_one(func.lower(User.email) == email.strip().lower())

    async def by_telegram_chat(self, chat_id: str) -> User | None:
        return await self.find_one(User.telegram_chat_id == chat_id)

    async def by_vk_user(self, vk_user_id: str) -> User | None:
        return await self.find_one(User.vk_user_id == vk_user_id)

    async def by_max_user(self, max_user_id: str) -> User | None:
        return await self.find_one(User.max_user_id == max_user_id)

    async def email_taken(self, email: str, *, except_id: str | None = None) -> bool:
        conditions = [func.lower(User.email) == email.strip().lower()]
        if except_id:
            conditions.append(User.id != except_id)
        return await self.exists(*conditions)

    async def admins(self) -> list[User]:
        """Кому уходят служебные уведомления о новых заявках."""
        return await self.find_many(User.role == "admin")


class SessionRepository(Repository[Session]):
    model = Session

    async def active_by_token_hash(self, token_hash: str) -> Session | None:
        """Живая сессия по хешу refresh-токена.

        Отозванные и просроченные отсеиваются здесь же: иначе проверку
        пришлось бы повторять в каждом вызывающем месте, и однажды её бы
        забыли.
        """
        now = datetime.now(UTC)
        return await self.find_one(
            Session.refresh_token_hash == token_hash,
            Session.revoked_at.is_(None),
            Session.expires_at > now,
        )

    async def revoke_all_for_user(self, user_id: str) -> None:
        """Выход со всех устройств: смена пароля должна гасить чужие сессии."""
        now = datetime.now(UTC)
        result = await self.session.execute(
            select(Session).where(Session.user_id == user_id, Session.revoked_at.is_(None))
        )
        for session in result.scalars().all():
            session.revoked_at = now

    async def purge_expired(self, *, before: datetime | None = None) -> int:
        """Чистка старых сессий — вызывается фоновой задачей."""
        moment = before or datetime.now(UTC)
        return await self.delete_where(Session.expires_at < moment)
