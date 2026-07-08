@echo off
setlocal enabledelayedexpansion

rem Launch Vibe-Research backend and frontend dev servers, then open the UI.

rem Resolve the repo root to a clean absolute path (no trailing backslash).
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

rem Stop any leftover backend/frontend processes still holding our ports.
powershell -Command "Get-NetTCPConnection -LocalPort 8900,5899 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" > nul 2>&1
timeout /t 1 /nobreak > nul

set "BACKEND_DIR=%REPO_ROOT%\backend"
set "FRONTEND_DIR=%REPO_ROOT%\frontend"
set "PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

rem Backend
if exist "%PYTHON%" (
    start "Vibe-Research Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && .venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8900"
) else (
    echo [ERROR] Backend virtual environment not found.
    echo Please set it up first:
    echo   cd backend
    echo   python -m venv .venv
    echo   .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

rem Frontend
if exist "%FRONTEND_DIR%\node_modules" (
    start "Vibe-Research Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"
) else (
    echo [ERROR] Frontend dependencies not found.
    echo Please install them first:
    echo   cd frontend
    echo   npm install
    pause
    exit /b 1
)

rem Wait for the backend port to be open.
echo Waiting for backend on http://localhost:8900 ...
set "backendReady=0"
for /L %%i in (1,1,30) do (
    powershell -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 8900); $c.Close(); exit 0 } catch { exit 1 }" > nul 2>&1
    if !errorlevel! == 0 (
        set "backendReady=1"
        goto :backend_ready
    )
    timeout /t 1 /nobreak > nul
)
:backend_ready
if "!backendReady!" == "0" (
    echo [ERROR] Backend did not start on http://localhost:8900 within 30 seconds.
    pause
    exit /b 1
)

rem Wait for the frontend port to be open, then open the dashboard.
echo Waiting for frontend on http://localhost:5899 ...
set "frontendReady=0"
for /L %%i in (1,1,30) do (
    powershell -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 5899); $c.Close(); exit 0 } catch { exit 1 }" > nul 2>&1
    if !errorlevel! == 0 (
        set "frontendReady=1"
        start http://localhost:5899
        goto :done
    )
    timeout /t 1 /nobreak > nul
)
:done
if "!frontendReady!" == "0" (
    echo [ERROR] Frontend did not start on http://localhost:5899 within 30 seconds.
    pause
    exit /b 1
)
