"""Пароли, токены доступа и случайные секреты.

Самое важное здесь — совместимость хешей. В прежней версии пароли считались
PBKDF2-SHA256 на 100 000 итераций и хранились как `pbkdf2$итерации$соль$хеш`
с обычным base64. Python считает ровно то же самое, поэтому база переезжает
как есть и никому не приходится заводить пароль заново.

Хешер спрятан за абстракцией намеренно: когда-нибудь захочется перейти на
argon2 (в Workers его не было, на своём сервере он доступен), и тогда рядом
встанет второй класс, а `verify` останется способным проверить старый хеш.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets
from abc import ABC, abstractmethod
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt

UserRole = Literal["user", "admin"]


class PasswordHasher(ABC):
    """Стратегия хеширования паролей."""

    @abstractmethod
    def hash(self, password: str) -> str: ...

    @abstractmethod
    def verify(self, password: str, stored: str) -> bool: ...


class Pbkdf2PasswordHasher(PasswordHasher):
    """PBKDF2-SHA256 в формате прежней версии на Workers."""

    scheme = "pbkdf2"
    #: Столько же, сколько считал Worker. Менять нельзя, не перехешировав базу.
    iterations = 100_000
    key_length = 32  # 256 бит
    salt_length = 16

    def hash(self, password: str) -> str:
        salt = secrets.token_bytes(self.salt_length)
        derived = self._derive(password, salt, self.iterations)
        parts = (
            self.scheme,
            str(self.iterations),
            base64.b64encode(salt).decode(),
            base64.b64encode(derived).decode(),
        )
        return "$".join(parts)

    def verify(self, password: str, stored: str) -> bool:
        parts = stored.split("$")
        if len(parts) != 4:
            return False
        scheme, raw_iterations, raw_salt, raw_hash = parts
        if scheme != self.scheme:
            return False
        try:
            iterations = int(raw_iterations)
            salt = base64.b64decode(raw_salt)
            expected = base64.b64decode(raw_hash)
        except (ValueError, binascii.Error):
            return False
        if iterations < 1:
            return False
        derived = self._derive(password, salt, iterations, len(expected))
        # Сравнение за постоянное время: иначе по задержке можно подбирать хеш.
        return hmac.compare_digest(derived, expected)

    def _derive(
        self,
        password: str,
        salt: bytes,
        iterations: int,
        length: int | None = None,
    ) -> bytes:
        return hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
            dklen=length or self.key_length,
        )


class AccessTokenPayload:
    """Содержимое access-токена.

    `sid` нужен, чтобы отозвать выданные токены вместе с сессией: без него
    украденный токен жил бы до истечения срока, даже если человек вышел.
    """

    __slots__ = ("role", "session_id", "user_id")

    def __init__(self, user_id: str, role: UserRole, session_id: str) -> None:
        self.user_id = user_id
        self.role = role
        self.session_id = session_id

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def __repr__(self) -> str:  # pragma: no cover — для отладки
        return f"AccessTokenPayload(user_id={self.user_id!r}, role={self.role!r})"


class TokenService:
    """Выпуск и проверка access-токенов."""

    algorithm = "HS256"

    def __init__(self, secret: str, ttl_minutes: int = 15) -> None:
        self._secret = secret
        self._ttl = timedelta(minutes=ttl_minutes)

    def issue(self, user_id: str, role: UserRole, session_id: str) -> str:
        now = datetime.now(UTC)
        claims: dict[str, Any] = {
            "sub": user_id,
            "role": role,
            "sid": session_id,
            "exp": int((now + self._ttl).timestamp()),
            "iat": int(now.timestamp()),
        }
        return jwt.encode(claims, self._secret, algorithm=self.algorithm)

    def verify(self, token: str) -> AccessTokenPayload | None:
        """Возвращает None на любой некорректный токен: разбирать причину
        незачем, а наружу всё равно уходит одно и то же «нужна авторизация»."""
        try:
            claims = jwt.decode(token, self._secret, algorithms=[self.algorithm])
        except jwt.PyJWTError:
            return None

        user_id = claims.get("sub")
        session_id = claims.get("sid")
        role = claims.get("role")
        if not isinstance(user_id, str) or not isinstance(session_id, str):
            return None
        if role not in ("user", "admin"):
            return None
        return AccessTokenPayload(user_id=user_id, role=role, session_id=session_id)


def random_token(length: int = 32) -> str:
    """Случайный токен в base64url без выравнивания — годится для URL и кук."""
    return base64.urlsafe_b64encode(secrets.token_bytes(length)).rstrip(b"=").decode()


def sha256_hex(value: str) -> str:
    """Хеш refresh-токена: в базе лежит он, а не сам токен."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
