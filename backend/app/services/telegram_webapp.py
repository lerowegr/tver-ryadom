"""Проверка подписи мини-приложения Telegram.

Telegram отдаёт странице строку `initData` с данными о человеке и подписью.
Подпись — единственное, что отличает настоящего посетителя от подделанной
строки, поэтому до её проверки не верим ничему.

Главная тонкость из документации: ключом служит не сам токен бота, а HMAC
от него со словом «WebAppData». Перепутать порядок легко, и тогда проверка
молча отвергала бы всех подряд.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import parse_qsl

#: Строка старше суток не принимается: подпись вечная, а сессия — нет.
MAX_AGE_SECONDS = 24 * 60 * 60
#: Допуск на расхождение часов.
CLOCK_SKEW_SECONDS = 60


@dataclass(frozen=True, slots=True)
class WebAppUser:
    id: str
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None

    @property
    def display_name(self) -> str:
        parts = [self.first_name, self.last_name or ""]
        return " ".join(part for part in parts if part).strip() or "Гость"


class TelegramWebAppVerifier:
    """Проверяет `initData` токеном бота."""

    def __init__(self, bot_token: str | None) -> None:
        self._bot_token = bot_token

    @property
    def enabled(self) -> bool:
        return bool(self._bot_token)

    def verify(self, init_data: str, *, now: datetime | None = None) -> WebAppUser | None:
        """Возвращает профиль или None. Причину не разглашаем: наружу
        уходит одно и то же сообщение, чтобы не подсказывать подбирающему."""
        if not init_data or not self._bot_token:
            return None

        # keep_blank_values: пустое поле входит в подписанную строку, и
        # выбросив его, мы получили бы другую строку и неверную подпись.
        pairs = parse_qsl(init_data, keep_blank_values=True)
        received = next((value for key, value in pairs if key == "hash"), None)
        if not received:
            return None

        data_check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(pairs, key=lambda item: item[0])
            if key != "hash"
        )

        secret_key = hmac.new(b"WebAppData", self._bot_token.encode(), hashlib.sha256).digest()
        expected = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, received):
            return None

        if not self._is_fresh(pairs, now or datetime.now(UTC)):
            return None

        return self._parse_user(pairs)

    def _is_fresh(self, pairs: list[tuple[str, str]], now: datetime) -> bool:
        raw = next((value for key, value in pairs if key == "auth_date"), None)
        if not raw:
            return False
        try:
            auth_date = int(raw)
        except ValueError:
            return False
        age = now.timestamp() - auth_date
        # Небольшой запас в минус: часы на сервере и у Telegram расходятся
        # на секунды, и честный вход не должен из-за этого отвергаться.
        return -CLOCK_SKEW_SECONDS <= age <= MAX_AGE_SECONDS

    def _parse_user(self, pairs: list[tuple[str, str]]) -> WebAppUser | None:
        raw = next((value for key, value in pairs if key == "user"), None)
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict) or not payload.get("id"):
            return None
        return WebAppUser(
            id=str(payload["id"]),
            first_name=payload.get("first_name") or "Гость",
            last_name=payload.get("last_name"),
            username=payload.get("username"),
            photo_url=payload.get("photo_url"),
        )
