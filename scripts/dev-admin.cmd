@echo off
rem Запуск админ-панели для локальной разработки (добавляет node/pnpm в PATH)
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0..\apps\admin"
pnpm exec next dev --port 3001
