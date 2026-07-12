@echo off
rem Запуск сайта для локальной разработки (добавляет node/pnpm в PATH)
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\web"
pnpm exec next dev --port 3000
