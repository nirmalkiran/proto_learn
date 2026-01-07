@echo off
echo ============================================
echo Mobile Automation Services Setup
echo ============================================
echo.

echo Starting backend server...
start /B npm start

echo Waiting for backend server to be ready...
timeout /t 5 /nobreak > nul

:check_server
curl -s http://localhost:3001/health >nul 2>&1
if %errorlevel% neq 0 (
    echo Still waiting for server...
    timeout /t 2 /nobreak > nul
    goto check_server
)

echo Backend server is ready!
echo Starting emulator, Appium, and agent...

curl -X POST http://localhost:3001/setup/auto -H "Content-Type: application/json" -d "{\"avd\":\"Pixel_nirmal\"}"

echo.
echo All services started successfully!
echo Mobile automation setup complete!
echo.
echo You can now use the mobile automation features in your app.
echo Press any key to close this window...
pause > nul
