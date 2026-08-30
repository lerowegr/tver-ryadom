@echo off
rem Показывает, какие секреты видит воркер tver-api. Значения не выводятся —
rem только имена, этого достаточно, чтобы понять, доехал ли токен.
rem ВАЖНО: не полагаемся на %APPDATA% — в системе есть профильные папки
rem с искажённой кириллицей, и pnpm оттуда не виден.
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\api"

echo.
echo   Секреты воркера tver-api:
echo.

where pnpm >nul 2>&1 && (
  pnpm exec wrangler secret list
) || (
  if exist "C:\Program Files\nodejs\corepack.cmd" (
    call "C:\Program Files\nodejs\corepack.cmd" pnpm exec wrangler secret list
  ) else (
    echo [ОШИБКА] Не найдены ни pnpm, ни corepack. Установите Node.js.
    exit /b 1
  )
)
