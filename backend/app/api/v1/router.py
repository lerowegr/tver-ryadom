"""Сборка маршрутов версии 1.

Модули подключаются по мере переноса: пока переехала только
аутентификация, остальные появятся здесь же.
"""

from fastapi import APIRouter

from app.api.v1 import auth

api_router = APIRouter()
api_router.include_router(auth.router)
