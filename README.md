# 🌱 Plantify — AI Plant Identifier & Care Assistant

Plantify is an intelligent mobile and web application that helps plant enthusiasts identify species, diagnose plant diseases, track plant health histories, receive automated care schedules, and discover curated plant care products.

---

## 🏗 System Architecture

```
Plantify/
├── Plantify_UI/            # React Native (Expo) Frontend Application
│   ├── app/                # Expo Router screen navigation & routes
│   │   ├── (tabs)/         # Bottom tab navigation (Home, Care, My Garden, Profile)
│   │   ├── index.tsx       # Welcome landing screen
│   │   ├── login.tsx       # Authentication Login screen (Matching UI mockup)
│   │   ├── register.tsx    # Authentication Register screen (Matching UI mockup)
│   │   ├── location-permission.tsx # Location permission flow for regional tips
│   │   ├── camera.tsx      # Real-time camera viewfinder
│   │   ├── upload-photo.tsx# Photo gallery picker & upload tips
│   │   └── plant-details.tsx # Comprehensive botanical care sheet & diagnosis
│   ├── components/         # Reusable UI components & SVG icons
│   ├── services/           # API services, SQLite cache, and notifications
│   └── database/           # Offline SQLite database & synchronization
│
├── backend/                # FastAPI (Python 3.11+) Backend Server
│   ├── app/
│   │   ├── ai/             # LangGraph AI workflows & Multi-Agent Vision pipeline
│   │   ├── config/         # Settings, JWT config, and database engines
│   │   ├── models/         # SQLAlchemy ORM models (Users, Plants, Scans, Products, Cart)
│   │   ├── repositories/   # Data access repositories
│   │   ├── routers/        # FastAPI endpoint routers (Auth, Plants, Scans, Products, Cart, Chat)
│   │   ├── schemas/        # Pydantic validation schemas
│   │   └── scripts/        # Database seeders (Products, Categories)
│   ├── alembic/            # Database schema migrations
│   └── docker-compose.yml  # PostgreSQL (Port 5434) & Redis container orchestration
│
├── package.json            # Root monorepo orchestration scripts
├── start-all.ps1           # One-click Windows PowerShell startup script
└── start-all.sh            # One-click Unix / macOS bash startup script
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18+ & npm
- **Python**: 3.11+ (with virtual environment in `backend/.venv`)
- **Docker**: Docker Desktop (for PostgreSQL container)

### 1. One-Click Startup (Recommended)

#### Windows:
```powershell
.\start-all.ps1
```
*(Or via npm)*:
```powershell
npm run start-all
```

#### macOS / Linux:
```bash
chmod +x ./start-all.sh
./start-all.sh
```

---

### 2. Manual Step-by-Step Execution

#### A. Database (PostgreSQL & Redis)
```bash
cd backend
docker-compose up -d
```
*PostgreSQL is exposed at `localhost:5434` (`plantify` database).*

#### B. Database Migrations & Seeding
```bash
cd backend
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.scripts.seed_products
```

#### C. Backend Server
```bash
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```
- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/health`

#### D. Frontend Mobile App
```bash
cd Plantify_UI
npm run start
```
Press `w` to open in Web browser, `a` for Android emulator, or scan QR with Expo Go on your mobile device.

---

## 📱 User Authentication & Onboarding Flow

1. **Welcome Screen** (`/`):
   - User taps *"Start Scanning the Plant"* or *"Upload Photo"*.
2. **Authentication Gate**:
   - If the user is unauthenticated, they are redirected to `/login`.
   - Users can sign in or tap *"Sign up"* to access `/register`.
3. **New User Location Permission** (`/location-permission`):
   - Upon registration or first login, the user is prompted to enable location for climate-adjusted care recommendations and regional native plant discovery.
4. **Target Destination**:
   - Following permission grant or skip, the user immediately transitions to their selected action (`/(tabs)` camera or `/upload-photo`).

---

## 🧪 Testing

### Run Backend Unit & Integration Tests:
```powershell
npm run test:backend
```
*(66 passing tests covering Auth, Plants, Scans, Vision Pipelines, Graph Agents, and Cart)*

### Run Frontend Type Check:
```powershell
npm run test:frontend
```
