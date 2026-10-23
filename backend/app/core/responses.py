"""Обёртка ответов API.

Формат достался от версии на Hono и менять его нельзя: клиенты читают
`success`, а не HTTP-статус. Здесь он описан типами, чтобы роутер не мог
случайно отдать голый объект мимо конверта.
"""

from __future__ import annotations

import math

from pydantic import BaseModel


class Envelope[T](BaseModel):
    """Успешный ответ: `{"success": true, "data": …}`."""

    success: bool = True
    data: T


class Page[T](BaseModel):
    """Страница списка. `pages` считает сервер — клиенту незачем это знать."""

    items: list[T]
    total: int
    page: int
    limit: int
    pages: int

    @classmethod
    def of(cls, items: list[T], total: int, page: int, limit: int) -> Page[T]:
        # Пустой список — всё равно одна страница: ноль страниц ломает
        # постраничную навигацию на клиенте.
        return cls(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=max(1, math.ceil(total / limit) if limit else 1),
        )


def ok[T](data: T) -> Envelope[T]:
    return Envelope(data=data)


def paginated[T](
    items: list[T], total: int, page: int, limit: int
) -> Envelope[Page[T]]:
    return Envelope(data=Page.of(items, total, page, limit))
