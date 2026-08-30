@echo off
rem Показывает, в какой аккаунт Cloudflare вошёл wrangler и какая версия
rem воркера сейчас боевая. Нужно, когда секрет в списке есть, а воркер
rem его не видит: чаще всего это разные аккаунты либо неактивная версия.
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\api"

set "RUN=pnpm exec"
where pnpm >nul 2>&1 || set "RUN=call "C:\Program Files\nodejs\corepack.cmd" pnpm exec"

echo.
echo ===== 1. Аккаунт, в который вошёл wrangler =====
%RUN% wrangler whoami

echo.
echo ===== 2. Последние выкладки воркера tver-api =====
%RUN% wrangler deployments list
