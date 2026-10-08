@echo off
chcp 65001 >nul
title Сборка архива для друзей
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make_zip.ps1"
echo.
pause
