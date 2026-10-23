"""Ошибки приложения.

Формат ответа менять нельзя: сайт, админка и боты разбирают
`{"success": false, "error": {"code", "message", "details"}}` и реагируют
на `code`, а не на HTTP-статус. Поэтому иерархия исключений повторяет
прежние коды один в один — фронтенд не должен заметить смену языка.

Вместо фабричных функций (`notFound()`, `conflict()`) здесь классы:
их видно в сигнатурах, на них ловится `except`, и каждая сама знает
свой код и статус.
"""

from __future__ import annotations

from typing import ClassVar, Literal

ErrorCode = Literal[
    "validation_error",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "rate_limited",
    "internal_error",
]


class AppError(Exception):
    """Ожидаемая ошибка: превращается в аккуратный ответ, а не в 500."""

    code: ClassVar[ErrorCode] = "internal_error"
    status: ClassVar[int] = 500
    default_message: ClassVar[str] = "Внутренняя ошибка сервера"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.details = details
        super().__init__(self.message)

    def to_payload(self) -> dict[str, object]:
        error: dict[str, object] = {"code": self.code, "message": self.message}
        if self.details:
            error["details"] = self.details
        return {"success": False, "error": error}


class ValidationError(AppError):
    code: ClassVar[ErrorCode] = "validation_error"
    status: ClassVar[int] = 422
    default_message: ClassVar[str] = "Проверьте правильность заполнения полей"


class UnauthorizedError(AppError):
    code: ClassVar[ErrorCode] = "unauthorized"
    status: ClassVar[int] = 401
    default_message: ClassVar[str] = "Требуется авторизация"


class ForbiddenError(AppError):
    code: ClassVar[ErrorCode] = "forbidden"
    status: ClassVar[int] = 403
    default_message: ClassVar[str] = "Недостаточно прав"


class NotFoundError(AppError):
    code: ClassVar[ErrorCode] = "not_found"
    status: ClassVar[int] = 404
    default_message: ClassVar[str] = "Не найдено"


class ConflictError(AppError):
    code: ClassVar[ErrorCode] = "conflict"
    status: ClassVar[int] = 409
    default_message: ClassVar[str] = "Конфликт состояния"


class RateLimitedError(AppError):
    code: ClassVar[ErrorCode] = "rate_limited"
    status: ClassVar[int] = 429
    default_message: ClassVar[str] = "Слишком много запросов"
