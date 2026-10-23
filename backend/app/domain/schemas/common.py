"""Общие типы и правила проверки.

Повторяют схемы `zod` из прежней версии: сообщения об ошибках видит
человек на сайте, и менять их заодно с языком бэкенда незачем.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

_DIGITS = re.compile(r"\D")


def normalize_ru_phone(raw: str) -> str | None:
    """Приводит российский номер к +7XXXXXXXXXX; None, если это не номер РФ."""
    digits = _DIGITS.sub("", raw)
    if len(digits) == 11 and digits[0] in ("7", "8"):
        return "+7" + digits[1:]
    if len(digits) == 10 and digits.startswith("9"):
        return "+7" + digits
    return None


def format_ru_phone(phone: str) -> str:
    """+79001234567 → «+7 900 123-45-67»."""
    match = re.fullmatch(r"\+7(\d{3})(\d{3})(\d{2})(\d{2})", phone)
    if not match:
        return phone
    return f"+7 {match.group(1)} {match.group(2)}-{match.group(3)}-{match.group(4)}"


Slug = Annotated[
    str,
    StringConstraints(min_length=2, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
]


class Schema(BaseModel):
    """Общий предок схем.

    `populate_by_name` вместе с псевдонимами даёт главное: внутри Python
    поля остаются в snake_case, а наружу уходят в camelCase — именно в том
    виде, в каком их ждут сайт, админка и боты.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
    )


def to_camel(value: str) -> str:
    head, *rest = value.split("_")
    return head + "".join(word.capitalize() for word in rest)


class CamelSchema(Schema):
    """Схема, отдающая наружу camelCase."""

    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
        alias_generator=to_camel,
    )


class Pagination(Schema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=12, ge=1, le=50)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class PhoneMixin:
    """Нормализация телефона для схем, где он встречается."""

    @field_validator("phone", check_fields=False, mode="after")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        normalized = normalize_ru_phone(value)
        if normalized is None:
            raise ValueError("Некорректный номер телефона")
        return normalized


class EmailMixin:
    """Почта приводится к нижнему регистру: «Elena@» и «elena@» — один адрес."""

    @field_validator("email", check_fields=False, mode="after")
    @classmethod
    def _normalize_email(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class ErrorDetail(Schema):
    code: str
    message: str
    details: dict[str, str] | None = None


class ErrorResponse(Schema):
    """Ответ об ошибке — ровно в том виде, в каком его разбирает клиент."""

    success: bool = False
    error: ErrorDetail

    @classmethod
    def of(cls, code: str, message: str, details: dict[str, str] | None = None) -> Self:
        return cls(error=ErrorDetail(code=code, message=message, details=details))
