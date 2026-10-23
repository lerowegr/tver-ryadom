"""Ограничение частоты запросов.

Защищает точки, доступные без входа: подбор пароля, спам формы обратной
связи, набивку слотов гостевыми бронями.

Счётчики живут в памяти процесса. Для этого сайта этого достаточно: при
нескольких рабочих процессах `uvicorn` у каждого будет свой счётчик, то
есть фактический предел окажется во столько же раз мягче. Здесь это
осознанный размен — внешнее хранилище ради сайта экскурсовода добавило бы
ещё одну службу, за которой надо следить. Если понадобится точный общий
счётчик, достаточно подставить другую реализацию `RateLimiter`.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

from fastapi import Request

from app.core.errors import RateLimitedError


@dataclass(frozen=True, slots=True)
class Rule:
    """Сколько запросов и за какое время."""

    limit: int
    window_seconds: int
    prefix: str


class RateLimiter(ABC):
    @abstractmethod
    async def take(self, key: str, rule: Rule) -> int:
        """Занимает слот и возвращает порядковый номер запроса в окне."""


class MemoryRateLimiter(RateLimiter):
    """Счётчики с фиксированным окном в памяти процесса."""

    #: Выше этого размера карта подчищается от истёкших окон. Без уборки
    #: она росла бы на каждый новый адрес и никогда не уменьшалась.
    SWEEP_AT = 1000

    def __init__(self) -> None:
        self._buckets: dict[str, tuple[int, float]] = {}

    async def take(self, key: str, rule: Rule) -> int:
        now = time.monotonic()
        self._sweep(now)

        count, reset_at = self._buckets.get(key, (0, 0.0))
        if reset_at > now:
            count += 1
            self._buckets[key] = (count, reset_at)
            return count

        self._buckets[key] = (1, now + rule.window_seconds)
        return 1

    def reset(self) -> None:
        self._buckets.clear()

    def _sweep(self, now: float) -> None:
        if len(self._buckets) < self.SWEEP_AT:
            return
        self._buckets = {
            key: value for key, value in self._buckets.items() if value[1] > now
        }


def client_ip(request: Request) -> str:
    """Адрес клиента. За обратным прокси настоящий — в заголовке."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    """Зависимость FastAPI: вешается на маршрут и ограничивает его.

    Вошедшего не ограничиваем: его и так держат сессия и возможность
    её отозвать, а ограничение по адресу било бы по всем из одной сети.
    """

    def __init__(self, rule: Rule, *, skip_authenticated: bool = True) -> None:
        self._rule = rule
        self._skip_authenticated = skip_authenticated

    async def __call__(self, request: Request) -> None:
        limiter: RateLimiter | None = getattr(request.app.state, "rate_limiter", None)
        if limiter is None:
            return

        if self._skip_authenticated and request.headers.get("authorization"):
            return

        key = f"{self._rule.prefix}:{client_ip(request)}"
        used = await limiter.take(key, self._rule)
        if used > self._rule.limit:
            raise RateLimitedError(
                "Слишком много запросов. Попробуйте позже.",
                details={"retryAfter": str(self._rule.window_seconds)},
            )


#: Готовые правила. Числа те же, что были на Workers.
RULES = {
    # Подбор пароля.
    "login": Rule(limit=10, window_seconds=900, prefix="login"),
    # Спам регистраций.
    "register": Rule(limit=5, window_seconds=3600, prefix="register"),
    # Перебор подписи мини-приложения.
    "telegram_webapp": Rule(limit=10, window_seconds=60, prefix="tgwebapp"),
    # Форма обратной связи уходит Елене в Telegram.
    "contact": Rule(limit=5, window_seconds=3600, prefix="contact"),
    # Набивка слотов гостевыми бронями.
    "booking": Rule(limit=20, window_seconds=3600, prefix="booking"),
    # Флуд модерации отзывами.
    "review": Rule(limit=10, window_seconds=3600, prefix="review"),
}
