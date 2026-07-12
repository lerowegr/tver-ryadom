@echo off
rem Запуск API для локальной разработки (добавляет node/pnpm в PATH)
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\api"
pnpm exec wrangler dev --port 8787
