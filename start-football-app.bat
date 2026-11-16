
@echo off
title Football Stats Application

cd /d "%~dp0"

echo Starting Football Stats...

start "Football Backend" cmd /k "npm.cmd run dev"

start "Football Frontend" cmd /k "npm.cmd run dev:client"

echo.
echo Football application is starting!
echo Open http://localhost:5173 in your browser.
echo.
pause
