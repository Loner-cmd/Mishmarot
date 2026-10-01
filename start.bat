@echo off
title Local Development Server - Mishmarot
echo Starting local development server...
start http://localhost:3000
where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
) else (
    "C:\Program Files\nodejs\node.exe" server.js
)
pause
