@echo off
rem Запуск сайта для локальной разработки.
rem ВАЖНО: не полагаемся на %APPDATA% — в системе есть профильные папки
rem с искажённой кириллицей, и pnpm оттуда не виден. corepack идёт в
rem комплекте с Node и лежит по чисто латинскому пути, поэтому он надёжнее.
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\web"
if not exist "package.json" (
  echo [ОШИБКА] Не найден apps\web. Запускайте скрипт из папки проекта.
  exit /b 1
)
where pnpm >nul 2>&1 && (
  pnpm exec next dev --port 3002
) || (
  if exist "C:\Program Files\nodejs\corepack.cmd" (
    call "C:\Program Files\nodejs\corepack.cmd" pnpm exec next dev --port 3002
  ) else (
    echo [ОШИБКА] Не найдены ни pnpm, ни corepack. Установите Node.js.
    exit /b 1
  )
)
