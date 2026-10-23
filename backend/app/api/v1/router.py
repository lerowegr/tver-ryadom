"""Сборка маршрутов версии 1.

Модули подключаются по мере переноса: остальные появятся здесь же.
"""

from fastapi import APIRouter

from app.api.v1 import admin, auth, bookings, content, tours

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(tours.router)
api_router.include_router(bookings.router)
api_router.include_router(content.router)
api_router.include_router(admin.router)
