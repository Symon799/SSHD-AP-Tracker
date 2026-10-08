@echo off
setlocal

cd /d "%~dp0"

echo Running SSHD AP Tracker checks...
echo.
call npm run check

echo.
if errorlevel 1 (
    echo Checks failed. Review the output above.
) else (
    echo All checks passed.
)

echo.
pause
endlocal
