@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
    call npm ci
    if errorlevel 1 goto end
)
set DEMO_V2=1
set DEMO_PORT=5190
set DEMO_AP_PORT=38292
call npm run demo
:end
pause
