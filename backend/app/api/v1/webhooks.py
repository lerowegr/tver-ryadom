"""Вебхуки мессенджеров.

Живут вне /api/v1 и без авторизации: площадки ходят сюда сами и про наши
токены не знают. Защита у каждой своя — секрет в адресе у Telegram,
секрет в теле у ВКонтакте.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import (
    MaxChannelDep,
    TelegramChannelDep,
    TelegramSetupDep,
    UowDep,
    VkChannelDep,
)
from app.core.rate_limit import RateLimit, Rule

router = APIRouter(tags=["webhooks"])

#: Пакеты обновлений приходят пачками, поэтому предел высокий — он здесь
#: только чтобы чужой не выжег ресурсы перебором.
TELEGRAM_RULE = Rule(limit=120, window_seconds=60, prefix="wtg")
VK_RULE = Rule(limit=60, window_seconds=60, prefix="wvk")
MAX_RULE = Rule(limit=60, window_seconds=60, prefix="wmax")


@router.post(
    "/webhook/telegram/{secret}",
    dependencies=[Depends(RateLimit(TELEGRAM_RULE, skip_authenticated=False))],
)
async def telegram_webhook(
    secret: str,
    request: Request,
    channel: TelegramChannelDep,
    setup: TelegramSetupDep,
    uow: UowDep,
) -> dict[str, bool]:
    """Обновление от Telegram.

    Ответ всегда успешный: на ошибку Telegram повторяет пакет, и один
    сломанный апдейт начал бы бесконечно возвращаться.
    """
    expected = await setup.read_secret()
    if not expected or secret != expected:
        # Молча: сообщать, что адрес угадан не до конца, незачем.
        return {"ok": True}

    update: dict[str, Any] = await request.json()
    await channel.handle(update)
    await uow.commit()
    return {"ok": True}


@router.post(
    "/webhook/vk",
    dependencies=[Depends(RateLimit(VK_RULE, skip_authenticated=False))],
)
async def vk_webhook(
    request: Request, channel: VkChannelDep, uow: UowDep
) -> Response:
    """Событие ВКонтакте.

    Отвечаем не конвертом API, а голой строкой: площадка ждёт именно
    «ok» или строку подтверждения и ничего другого не принимает.
    """
    update: dict[str, Any] = await request.json()
    answer = await channel.handle(update)
    await uow.commit()
    return Response(content=answer, media_type="text/plain")


@router.post(
    "/webhook/max",
    dependencies=[Depends(RateLimit(MAX_RULE, skip_authenticated=False))],
)
async def max_webhook(
    request: Request, channel: MaxChannelDep, uow: UowDep
) -> Response:
    update: dict[str, Any] = await request.json()
    answer = await channel.handle(update)
    await uow.commit()
    return Response(content=answer, media_type="text/plain")
