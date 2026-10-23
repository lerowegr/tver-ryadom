"""Проверка «я не робот» (Cloudflare Turnstile).

Нужна на точках, открытых без входа: форма обратной связи, отзывы,
гостевые брони. Вошедшему капча не нужна — его держат сессия и
возможность её отозвать.

Пока секрет не задан, проверка пропускается: так сайт работает и до
подключения виджета, и в тестах. Виджет на стороне фронтенда ставится
отдельно, здесь только серверная половина.
"""

from __future__ import annotations

import httpx

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT = httpx.Timeout(10.0)


class CaptchaVerifier:
    def __init__(self, secret: str | None) -> None:
        self._secret = secret

    @property
    def enabled(self) -> bool:
        return bool(self._secret)

    async def verify(self, token: str | None, *, ip: str | None = None) -> bool:
        if not self._secret:
            # Виджет не подключён — пропускаем, иначе форма перестала бы
            # работать у всех разом.
            return True
        if not token:
            return False

        payload = {"secret": self._secret, "response": token}
        if ip:
            payload["remoteip"] = ip

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.post(VERIFY_URL, data=payload)
        except httpx.HTTPError:
            # Недоступная проверка — это отказ, а не пропуск: иначе её
            # можно было бы обойти, уронив связь до Cloudflare.
            return False

        if response.status_code >= 400:
            return False
        body = response.json()
        return bool(body.get("success"))
