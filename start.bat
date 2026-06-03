@echo off
setlocal
cd /d "%~dp0"

if "%DATABASE_URL%"=="" (
  echo DATABASE_URL is not set.
  echo Set PostgreSQL connection string before start, for example:
  echo set DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/garage_master
  pause
  exit /b 1
)

if exist "runtime\node\node.exe" (
  set "NODE_EXE=%~dp0runtime\node\node.exe"
) else (
  set "NODE_EXE=node"
)

if not exist "apps\api\dist\server.js" (
  echo Build not found. Run setup.bat first.
  pause
  exit /b 1
)

if "%JWT_SECRET%"=="" set "JWT_SECRET=dev-secret-change-me"
if "%HOST%"=="" set "HOST=0.0.0.0"
if "%GEOCODE_DEFAULT_CITY%"=="" set "GEOCODE_DEFAULT_CITY=Ульяновск, Россия"
if "%GEOCODE_USER_AGENT%"=="" set "GEOCODE_USER_AGENT=GarageMaster/1.0"

echo Starting GarageMaster...
"%NODE_EXE%" "apps\api\dist\server.js"
pause
