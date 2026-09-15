@echo off
title KROWN ERP - Print Bridge v2
setlocal

echo =============================================
echo   KROWN ERP - Silent Thermal Printer Bridge
echo =============================================
echo.
echo Starting local printer service...
echo USB receipt printer : Windows auto-discovery
echo LAN printer         : configured by KROWN Printer Settings
echo.
echo This service does NOT contain Neon or Supabase credentials.
echo It only listens on localhost:9101.
echo.

:start
node "%~dp0krown-print-bridge-v2.mjs"

if errorlevel 1 (
  echo.
  echo [ERROR] Print bridge stopped. Restarting in 5 seconds...
  timeout /t 5 /nobreak >nul
  goto :start
)

endlocal
