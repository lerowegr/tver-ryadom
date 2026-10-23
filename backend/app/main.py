"""Сборка приложения.

`create_app` собирает экземпляр из настроек, а не из глобалей: тесты
поднимают своё приложение со своей базой, и состояние между ними не течёт.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.database import Database
from app.core.errors import AppError, ValidationError
from app.domain import models  # noqa: F401 — регистрирует таблицы в метаданных

logger = logging.getLogger("tver")


def create_app(settings: Settings | None = None, *, database: Database | None = None) -> FastAPI:
    resolved = settings or get_settings()
    resolved.check_production_ready()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        own_database = database is None
        db = database or Database(str(resolved.database_url), echo=resolved.database_echo)
        app.state.settings = resolved
        app.state.database = db
        try:
            yield
        finally:
            # Чужую базу не закрываем: её передал тот, кто ею и распоряжается.
            if own_database:
                await db.dispose()

    app = FastAPI(
        title="Тверь рядом — API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not resolved.is_production else None,
        redoc_url=None,
    )

    if resolved.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=resolved.cors_origins,
            # Без этого браузер не отправит refresh-куку на кросс-доменный API.
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    _register_error_handlers(app)
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health", tags=["service"])
    async def health() -> dict[str, object]:
        return {"success": True, "data": {"status": "ok"}}

    return app


def _register_error_handlers(app: FastAPI) -> None:
    """Ошибки приводятся к тому же конверту, что и успешные ответы: клиент
    разбирает `success` и `error.code`, а не HTTP-статус."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details: dict[str, str] = {}
        for error in exc.errors():
            # Первый элемент пути — «body» или «query»; человеку он не нужен.
            location = [str(part) for part in error["loc"][1:]] or [str(error["loc"][-1])]
            details[".".join(location)] = error["msg"]
        failure = ValidationError(details=details or None)
        return JSONResponse(status_code=failure.status, content=failure.to_payload())

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Наружу уходит общее сообщение, подробности — в журнал: текст
        # исключения может содержать и запрос, и данные.
        logger.exception("Необработанная ошибка на %s", request.url.path, exc_info=exc)
        return JSONResponse(status_code=500, content=AppError().to_payload())


app = create_app()
