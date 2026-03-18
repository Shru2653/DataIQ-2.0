$ErrorActionPreference = "Stop"

Write-Host "Ensuring Python venv (.venv)..." -ForegroundColor Cyan
if (!(Test-Path ".venv/Scripts/python.exe")) {
  py -3.12 -m venv ".venv"
}

Write-Host "Installing backend deps (venv)..." -ForegroundColor Cyan
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r "backend/requirements.txt"

Write-Host "Installing frontend deps..." -ForegroundColor Cyan
Push-Location frontend
if (Test-Path package-lock.json) {
  npm ci
} else {
  npm install
}
Pop-Location

Write-Host "Starting backend (http://localhost:8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command', 'Set-Location backend; ..\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000'

Start-Sleep -Seconds 2
Write-Host "Starting frontend (http://localhost:5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command', 'Set-Location frontend; npm run dev'

Write-Host "Both servers launched. Press Ctrl+C in their windows to stop." -ForegroundColor Yellow
