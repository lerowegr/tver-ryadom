"""Сборка приложения.

`create_app` собирает экземпляр из настроек, а не из глобалей: тесты
поднимают своё приложение со своей базой, и состояние между ними не течёт.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from hmac import compare_digest

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.database import Database
from app.core.errors import AppError, NotFoundError, ValidationError
from app.core.rate_limit import MemoryRateLimiter
from app.domain import models  # noqa: F401 — регистрирует таблицы в метаданных
from app.scheduler import BackgroundJobs

logger = logging.getLogger("tver")


def create_app(
    settings: Settings | None = None,
    *,
    database: Database | None = None,
    with_scheduler: bool | None = None,
) -> FastAPI:
    resolved = settings or get_settings()
    resolved.check_production_ready()
    # В тестах фоновые задачи только мешают: они трогают ту же базу
    # в произвольный момент.
    run_jobs = with_scheduler if with_scheduler is not None else resolved.environment != "test"

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        own_database = database is None
        db = database or Database(str(resolved.database_url), echo=resolved.database_echo)
        app.state.settings = resolved
        app.state.database = db
        app.state.rate_limiter = MemoryRateLimiter()

        jobs = BackgroundJobs(db, resolved) if run_jobs else None
        app.state.jobs = jobs
        if jobs is not None:
            jobs.start()
        try:
            yield
        finally:
            if jobs is not None:
                await jobs.stop()
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

    @app.get("/images/{key:path}", tags=["service"])
    async def serve_image(key: str, request: Request) -> Response:
        """Раздача фотографий из хранилища.

        В продакшене это стоит закрыть обратным прокси или CDN: гонять
        картинки через Python на каждый просмотр — пустая трата. Но
        маршрут нужен, чтобы сайт работал и без такой настройки.
        """
        from urllib.parse import unquote

        from app.api.deps import get_storage
        from app.services.storage import read_or_404

        decoded = unquote(key)
        # Ключ приходит из адреса, и выход за пределы хранилища закрыт явно.
        if not decoded or ".." in decoded:
            raise NotFoundError()

        stored = await read_or_404(get_storage(request, resolved), decoded)
        return Response(
            content=stored.body,
            media_type=stored.content_type,
            # Содержимое по ключу не меняется: в ключе есть случайная часть.
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    @app.get("/calendar/{file}", tags=["service"])
    async def calendar_feed(file: str, request: Request) -> Response:
        """Лента занятости по секретной ссылке.

        Вне /api/v1 и без авторизации намеренно: подписчик вроде Google
        Календаря ходит сюда сам, заголовков не шлёт и про токены не знает.
        Доступ защищает длинный секрет в самом адресе.
        """
        from app.core.unit_of_work import UnitOfWork
        from app.services.admin.calendar import AdminCalendarService
        from app.services.calendar import FeedTokenService, IcsBuilder

        token = file.removesuffix(".ics")
        database: Database = app.state.database

        async with UnitOfWork(database.session_factory) as uow:
            expected = await FeedTokenService(uow).read()
            # Сравнение за постоянное время: по задержке ответа секрет
            # иначе можно подбирать посимвольно. Байты, а не строки:
            # compare_digest отказывается сравнивать не-ASCII, а в адресе
            # может оказаться что угодно.
            if not expected or not compare_digest(
                token.encode("utf-8"), expected.encode("utf-8")
            ):
                raise NotFoundError()

            # Окно ленты: прошлый месяц и год вперёд. Прошлое нужно, чтобы
            # в календаре осталась история, будущее — ради планов.
            now = datetime.now(UTC)
            entries = await AdminCalendarService(uow).load_range(
                now - timedelta(days=31), now + timedelta(days=365)
            )

        body = IcsBuilder(resolved.site_url).build(entries)
        return Response(
            content=body,
            media_type="text/calendar; charset=utf-8",
            headers={
                "Content-Disposition": 'inline; filename="tver-ryadom.ics"',
                # Подписчики ходят раз в час; лишний раз базу не тревожим.
                "Cache-Control": "private, max-age=300",
            },
        )

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
