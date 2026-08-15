# Plantify Backend

FastAPI backend for the Plantify mobile application. Provides authentication, plant management, image scanning, and a foundation for AI-powered plant analysis.

## Tech Stack

- **Python 3.11+** with **FastAPI**
- **PostgreSQL** with **SQLAlchemy 2.x**
- **Alembic** for database migrations
- **Pydantic v2** for data validation
- **JWT** (python-jose) for authentication
- **bcrypt** (passlib) for password hashing

## Prerequisites

- Python 3.11 or higher
- PostgreSQL 14+
- pip (Python package manager)

## Setup

### 1. Create Virtual Environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. PostgreSQL Database

Create a PostgreSQL database:

```sql
CREATE DATABASE plantify;
```

Or via command line:

```bash
createdb plantify
```

### 4. Environment Variables

Copy the example `.env` and update with your values:

```bash
cp .env.example .env
```

Key variables to configure:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/plantify` |
| `JWT_SECRET` | Secret key for JWT tokens | (change this!) |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:8081` |
| `PLANTNET_API_KEY` | Pl@ntNet API key | - |

### 5. Run Database Migrations

```bash
alembic upgrade head
```

### 6. Start the Server

```bash
uvicorn app.main:app --reload --port 8000
```

The server will start at `http://localhost:8000`.

## API Documentation

FastAPI auto-generates interactive API docs:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current user profile |

### Plants

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/plants` | Create a new plant |
| GET | `/api/plants` | List all user's plants |
| GET | `/api/plants/{id}` | Get a specific plant |
| PATCH | `/api/plants/{id}` | Update a plant |
| DELETE | `/api/plants/{id}` | Delete a plant |

### Scans

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/plants/{id}/scans` | Upload image & create scan |
| GET | `/api/plants/{id}/scans` | List scans for a plant |
| GET | `/api/scans/{id}` | Get scan details |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | API health check |

## Running Tests

Tests use an in-memory SQLite database (no PostgreSQL required):

```bash
pytest tests/ -v
```

Run with coverage:

```bash
pytest tests/ -v --tb=short
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config/
│   │   ├── settings.py       # Pydantic settings from .env
│   │   └── database.py       # SQLAlchemy engine & session
│   ├── models/               # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── plant.py
│   │   ├── plant_image.py
│   │   ├── plant_scan.py
│   │   └── health_analysis.py
│   ├── schemas/              # Pydantic request/response schemas
│   ├── routers/              # FastAPI route handlers
│   │   ├── auth.py
│   │   ├── plants.py
│   │   └── scans.py
│   ├── services/             # Business logic layer
│   │   ├── auth_service.py
│   │   ├── plant_service.py
│   │   ├── scan_service.py
│   │   └── image_storage_service.py
│   ├── repositories/         # Data access layer
│   ├── middleware/            # Error handlers, logging
│   ├── dependencies/         # FastAPI dependencies (auth, db)
│   ├── utils/                # Helper utilities
│   └── ai/                   # AI/ML pipeline (interfaces only)
│       ├── providers/base.py # Abstract provider interfaces
│       └── schemas/          # AI result schemas
├── alembic/                  # Database migrations
├── uploads/                  # Uploaded images (dev)
├── tests/                    # Pytest test suite
├── requirements.txt
├── .env
└── .env.example
```

## Architecture Notes

### Layered Architecture

```
Routers → Services → Repositories → Database
                 ↓
          AI Providers (future)
```

- **Routers**: HTTP request handling, validation, response formatting
- **Services**: Business logic, ownership checks, orchestration
- **Repositories**: Pure database operations (CRUD)
- **AI Providers**: Abstract interfaces for swappable AI backends

### Future AI Pipeline

The architecture is prepared for async AI processing:

```
Image Upload → Create Scan → Queue AI Job → AI Processing → Store Results → Frontend polls
```

AI provider interfaces are defined in `app/ai/providers/base.py`:

- `PlantIdentificationProvider` — e.g., PlantNet
- `HealthAnalysisProvider` — e.g., Custom ML model
- `DiseaseAnalysisProvider` — e.g., Custom disease model
- `AIRecommendationProvider` — e.g., LLM-based
- `ProductRecommendationProvider` — e.g., Rule-based + LLM

### Image Storage

The `ImageStorageProvider` abstraction (`app/services/image_storage_service.py`) currently uses local filesystem storage. Provider stubs exist for:

- AWS S3
- Cloudinary
- Supabase Storage

## Creating New Migrations

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "description of changes"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```
