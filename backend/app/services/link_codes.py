"""Подписанные коды: привязка Telegram и восстановление пароля.

Ничего не хранится: идентификатор и срок подписаны ключом сервера.
Для кода привязки это ещё и единственный вариант — он едет в параметре
`/start`, где Telegram разрешает только буквы, цифры, дефис и
подчёркивание, и не длиннее 64 символов.

Формат: `<id>_<срок в 36-ричной>_<подпись>`. Идентификатор — UUID, в нём
только hex и дефисы, подпись — hex, поэтому «_» встречается ровно дважды
как разделитель.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass

#: Код привязки живёт недолго: он открывает доступ к учётной записи.
LINK_TTL_SECONDS = 15 * 60
#: Ссылка из письма — час. Дольше держать опасно, короче неудобно.
RESET_TTL_SECONDS = 60 * 60

SIGNATURE_LENGTH = 16


@dataclass(frozen=True, slots=True)
class SignedCode:
    """Подписанный код с ограниченным сроком."""

    secret: str
    purpose: str
    ttl_seconds: int

    def create(self, subject: str, *, now: float | None = None) -> str:
        if "_" in subject:
            raise ValueError("Идентификатор не должен содержать «_»")
        # Именно `is None`: ноль — допустимый момент времени, а при
        # проверке через `or` он подменился бы текущим.
        moment = time.time() if now is None else now
        expires = int(moment + self.ttl_seconds)
        return f"{subject}_{_base36(expires)}_{self._sign(subject, expires)}"

    def verify(self, code: str, *, now: float | None = None) -> str | None:
        parts = code.split("_")
        if len(parts) != 3:
            return None
        subject, raw_expires, signature = parts
        try:
            expires = int(raw_expires, 36)
        except ValueError:
            return None
        moment = time.time() if now is None else now
        if not subject or expires < moment:
            return None
        # Сравнение за постоянное время: по задержке иначе можно
        # подбирать подпись.
        expected = self._sign(subject, expires)
        return subject if hmac.compare_digest(expected, signature) else None

    def _sign(self, subject: str, expires: int) -> str:
        message = f"{self.purpose}.{subject}.{expires}".encode()
        digest = hmac.new(self.secret.encode(), message, hashlib.sha256).hexdigest()
        return digest[:SIGNATURE_LENGTH]


def _base36(value: int) -> str:
    if value == 0:
        return "0"
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while value:
        value, remainder = divmod(value, 36)
        out = alphabet[remainder] + out
    return out


def link_codes(secret: str) -> SignedCode:
    return SignedCode(secret=secret, purpose="tg-link", ttl_seconds=LINK_TTL_SECONDS)


def reset_codes(secret: str) -> SignedCode:
    return SignedCode(secret=secret, purpose="pwd-reset", ttl_seconds=RESET_TTL_SECONDS)
