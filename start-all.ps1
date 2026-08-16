# Plantify One-Click Startup Script (Windows PowerShell)
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🌱 Starting Plantify Full-Stack App   " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$RootPath = $PSScriptRoot
$BackendPath = Join-Path $RootPath "backend"
$FrontendPath = Join-Path $RootPath "Plantify_UI"
$VenvPython = Join-Path $BackendPath ".venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $BackendPath ".venv\Scripts\uvicorn.exe"
$VenvAlembic = Join-Path $BackendPath ".venv\Scripts\alembic.exe"

# Fallback to system python if venv path is slightly different
if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python"
    $VenvUvicorn = "uvicorn"
    $VenvAlembic = "alembic"
}

# 1. Start Docker Containers (PostgreSQL on port 5434)
Write-Host "`n[1/4] Starting PostgreSQL & Redis via Docker..." -ForegroundColor Cyan
try {
    Push-Location $BackendPath
    docker-compose up -d
    Pop-Location
    Write-Host "  -> Docker services started successfully." -ForegroundColor Green
} catch {
    Write-Host "  -> Warning: Docker could not be started automatically. Ensure PostgreSQL is running on port 5434." -ForegroundColor Yellow
}

# 2. Run Database Migrations & Seeds
Write-Host "`n[2/4] Applying Database Migrations & Catalog Seed Data..." -ForegroundColor Cyan
try {
    Push-Location $BackendPath
    & $VenvAlembic upgrade head
    & $VenvPython -m app.scripts.seed_products
    Pop-Location
    Write-Host "  -> Database schema and seed products ready." -ForegroundColor Green
} catch {
    Write-Host "  -> Warning: Database migration/seed encountered an issue. Skipping if already applied." -ForegroundColor Yellow
}

# 3. Launch Backend Server in New Window
Write-Host "`n[3/4] Launching FastAPI Backend on http://localhost:8000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendPath'; & '$VenvUvicorn' app.main:app --reload --port 8000 --host 0.0.0.0"
Write-Host "  -> Backend server launched in separate terminal." -ForegroundColor Green

# 4. Launch Frontend Expo Server in New Window
Write-Host "`n[4/4] Launching Expo Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendPath'; npx expo start"
Write-Host "  -> Expo frontend launched in separate terminal." -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Plantify Services Running:            " -ForegroundColor Green
Write-Host "  • Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "  • API Docs:     http://localhost:8000/docs" -ForegroundColor White
Write-Host "  • Database:     localhost:5434 (plantify)" -ForegroundColor White
Write-Host "  • Frontend:     Expo Metro Bundler" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
