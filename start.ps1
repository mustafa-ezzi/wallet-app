# CashTrail — start backend + frontend in separate windows
Write-Host "Starting CashTrail..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$PSScriptRoot\backend'; py manage.py runserver 8000" -WindowStyle Normal
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "Servers launching in new windows." -ForegroundColor Green
Write-Host "  Backend  →  http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "  Frontend →  http://localhost:5173  (or next available port)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Open the frontend URL in your browser to use the app." -ForegroundColor Cyan
