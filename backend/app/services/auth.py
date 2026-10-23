"""Регистрация, вход, сессии и профиль.

Вся логика собрана в один объект с явными зависимостями: единица работы,
хешер, выпуск токенов. В прежней версии это был набор функций, каждая из
которых получала `db` и `secret` отдельными аргументами, — подменить их
в тесте было можно, но состав зависимостей приходилось держать в голове.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.errors import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from app.core.security import PasswordHasher, TokenService, random_token, sha256_hex
from app.core.unit_of_work import UnitOfWork
from app.domain.models.auth import Session, User
from app.domain.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    PublicUser,
    RegisterRequest,
    UpdateProfileRequest,
)
from app.services.telegram_webapp import TelegramWebAppVerifier

#: Одно сообщение и на незнакомый адрес, и на неверный пароль: разные
#: ответы подсказали бы, какие адреса зарегистрированы.
BAD_CREDENTIALS = "Неверный email или пароль"


@dataclass(frozen=True, slots=True)
class SessionMeta:
    """Откуда вошли — чтобы человек узнал свои сессии в списке устройств."""

    user_agent: str | None = None
    ip: str | None = None


@dataclass(frozen=True, slots=True)
class IssuedSession:
    """Выданная пара токенов. Refresh уходит в куку, access — в тело ответа."""

    user: PublicUser
    access_token: str
    refresh_token: str


class AuthService:
    def __init__(
        self,
        uow: UnitOfWork,
        hasher: PasswordHasher,
        tokens: TokenService,
        *,
        refresh_ttl_days: int = 30,
        webapp: TelegramWebAppVerifier | None = None,
    ) -> None:
        self._uow = uow
        self._hasher = hasher
        self._tokens = tokens
        self._refresh_ttl = timedelta(days=refresh_ttl_days)
        self._webapp = webapp

    # ---- Вход и регистрация ---------------------------------------------

    async def register(self, data: RegisterRequest, meta: SessionMeta) -> IssuedSession:
        if await self._uow.users.email_taken(data.email):
            raise ConflictError("Пользователь с таким email уже зарегистрирован")

        user = User(
            email=data.email,
            phone=data.phone,
            name=data.name,
            password_hash=self._hasher.hash(data.password),
            role="user",
        )
        self._uow.users.add(user)
        await self._uow.flush()
        return await self._issue(user, meta)

    async def login(self, data: LoginRequest, meta: SessionMeta) -> IssuedSession:
        user = await self._uow.users.by_email(data.email)
        if user is None or not user.password_hash:
            # Хеш всё равно считаем: без этого ответ на незнакомый адрес
            # приходил бы заметно быстрее, и адреса можно было бы перебирать.
            self._hasher.hash(data.password)
            raise UnauthorizedError(BAD_CREDENTIALS)
        if not self._hasher.verify(data.password, user.password_hash):
            raise UnauthorizedError(BAD_CREDENTIALS)
        return await self._issue(user, meta)

    async def login_by_webapp(self, init_data: str, meta: SessionMeta) -> IssuedSession:
        """Вход из мини-приложения Telegram.

        Учётная запись ищется по тому же идентификатору, что пишет бот: в
        личной переписке идентификатор чата и человека совпадают. Поэтому
        мини-приложение и переписка с ботом попадают в одну запись, а брони
        с сайта видны там же — отдельной синхронизации не требуется.
        """
        if self._webapp is None or not self._webapp.enabled:
            raise UnauthorizedError("Вход через Telegram сейчас недоступен")

        profile = self._webapp.verify(init_data)
        if profile is None:
            raise UnauthorizedError("Не удалось подтвердить вход через Telegram")

        user = await self._uow.users.by_telegram_chat(profile.id)
        if user is None:
            # Ни почты, ни пароля: личность подтвердил сам Telegram.
            user = User(name=profile.display_name, telegram_chat_id=profile.id)
            self._uow.users.add(user)
            await self._uow.flush()
        return await self._issue(user, meta)

    # ---- Сессии ----------------------------------------------------------

    async def refresh(self, refresh_token: str) -> IssuedSession:
        session = await self._uow.sessions.active_by_token_hash(sha256_hex(refresh_token))
        if session is None:
            raise UnauthorizedError("Сессия истекла, войдите заново")

        # Ротация: предъявленный токен перестаёт действовать сразу, поэтому
        # перехваченный однажды токен работает лишь до следующего обновления.
        next_token = random_token()
        session.refresh_token_hash = sha256_hex(next_token)
        session.expires_at = datetime.now(UTC) + self._refresh_ttl

        user = await self._uow.users.get(session.user_id)
        if user is None:  # pragma: no cover — ссылка каскадная, но проверим
            raise UnauthorizedError("Сессия истекла, войдите заново")

        return IssuedSession(
            user=PublicUser.model_validate(user),
            access_token=self._tokens.issue(user.id, user.role, session.id),
            refresh_token=next_token,
        )

    async def logout(self, refresh_token: str) -> None:
        """Отзыв по refresh-токену: работает и с протухшим access-токеном."""
        session = await self._uow.sessions.find_one(
            Session.refresh_token_hash == sha256_hex(refresh_token),
            Session.revoked_at.is_(None),
        )
        if session is not None:
            session.revoke()

    async def _issue(self, user: User, meta: SessionMeta) -> IssuedSession:
        refresh_token = random_token()
        session = Session(
            user_id=user.id,
            refresh_token_hash=sha256_hex(refresh_token),
            expires_at=datetime.now(UTC) + self._refresh_ttl,
            user_agent=meta.user_agent,
            ip=meta.ip,
        )
        self._uow.sessions.add(session)
        await self._uow.flush()
        return IssuedSession(
            user=PublicUser.model_validate(user),
            access_token=self._tokens.issue(user.id, user.role, session.id),
            refresh_token=refresh_token,
        )

    # ---- Профиль ---------------------------------------------------------

    async def get_profile(self, user_id: str) -> PublicUser:
        user = await self._require_user(user_id)
        return PublicUser.model_validate(user)

    async def update_profile(self, user_id: str, data: UpdateProfileRequest) -> PublicUser:
        user = await self._require_user(user_id)
        # exclude_unset отличает «поле не прислали» от «прислали пустым»:
        # во втором случае телефон нужно стереть, а не оставить прежним.
        patch = data.model_dump(exclude_unset=True)
        if "name" in patch and patch["name"] is not None:
            user.name = patch["name"]
        if "phone" in patch:
            user.phone = patch["phone"]
        return PublicUser.model_validate(user)

    async def change_password(
        self, user_id: str, session_id: str, data: ChangePasswordRequest
    ) -> None:
        user = await self._require_user(user_id)
        if not user.password_hash:
            raise ValidationError("Для этого аккаунта пароль не задан")
        if not self._hasher.verify(data.current_password, user.password_hash):
            raise UnauthorizedError("Неверный текущий пароль")

        user.password_hash = self._hasher.hash(data.new_password)

        # Остальные устройства выбиваем: смена пароля затем и нужна, чтобы
        # тот, кто им завладел, потерял доступ.
        now = datetime.now(UTC)
        others = await self._uow.sessions.find_many(
            Session.user_id == user_id,
            Session.id != session_id,
            Session.revoked_at.is_(None),
        )
        for session in others:
            session.revoked_at = now

    async def _require_user(self, user_id: str) -> User:
        user = await self._uow.users.get(user_id)
        if user is None:
            raise NotFoundError("Пользователь не найден")
        return user
