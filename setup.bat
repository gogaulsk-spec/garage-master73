@echo off
setlocal
cd /d "%~dp0"

echo Installing dependencies...
call npm install
if errorlevel 1 goto :fail

echo Building project...
call npm run build
if errorlevel 1 goto :fail

echo Done. You can now run start.bat
pause
exit /b 0

:fail
echo Setup failed.
pause
exit /b 1
