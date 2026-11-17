@echo off
cd /d "%~dp0"
node --test || exit /b 1
node server.mjs --open %*
