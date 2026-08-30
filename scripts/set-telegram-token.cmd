@echo off
rem Заводит токен Telegram-бота секретом воркера tver-api.
rem ВАЖНО: не полагаемся на %APPDATA% — в системе есть профильные папки
rem с искажённой кириллицей, и pnpm оттуда не виден. corepack идёт в
rem комплекте с Node и лежит по чисто латинскому пути, поэтому он надёжнее.
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\api"

echo.
echo   Сейчас wrangler попросит войти в Cloudflare (откроется браузер),
echo   а затем — вставить токен от BotFather. Токен не отображается при
echo   вводе, это нормально. Вставка — правой кнопкой мыши.
echo.

where pnpm >nul 2>&1 && (
  pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
) || (
  if exist "C:\Program Files\nodejs\corepack.cmd" (
    call "C:\Program Files\nodejs\corepack.cmd" pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
  ) else (
    echo [ОШИБКА] Не найдены ни pnpm, ни corepack. Установите Node.js.
    exit /b 1
  )
)
