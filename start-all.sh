#!/usr/bin/env bash
# Plantify One-Click Startup Script (Bash / Unix)

set -e

echo "========================================"
echo "  🌱 Starting Plantify Full-Stack App   "
echo "========================================"

ROOT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PATH="$ROOT_PATH/backend"
FRONTEND_PATH="$ROOT_PATH/Plantify_UI"

# Python executable
if [ -f "$BACKEND_PATH/.venv/bin/python" ]; then
    PYTHON="$BACKEND_PATH/.venv/bin/python"
    ALEMBIC="$BACKEND_PATH/.venv/bin/alembic"
    UVICORN="$BACKEND_PATH/.venv/bin/uvicorn"
else
    PYTHON="python3"
    ALEMBIC="alembic"
    UVICORN="uvicorn"
fi

# 1. Start Docker Containers
echo ""
echo "[1/4] Starting PostgreSQL & Redis via Docker..."
(cd "$BACKEND_PATH" && docker-compose up -d) || echo "Warning: Docker startup failed. Ensure PostgreSQL is active on port 5434."

# 2. Database Migrations & Seeding
echo ""
echo "[2/4] Applying Database Migrations & Seeding Products..."
(cd "$BACKEND_PATH" && "$ALEMBIC" upgrade head || true)
(cd "$BACKEND_PATH" && "$PYTHON" -m app.scripts.seed_products || true)

# 3. Launch Backend
echo ""
echo "[3/4] Launching FastAPI Backend on http://localhost:8000..."
(cd "$BACKEND_PATH" && "$UVICORN" app.main:app --reload --port 8000 --host 0.0.0.0) &
BACKEND_PID=$!

# 4. Launch Frontend
echo ""
echo "[4/4] Launching Expo Frontend..."
(cd "$FRONTEND_PATH" && npx expo start)

# Cleanup backend on exit
kill $BACKEND_PID 2>/dev/null || true
