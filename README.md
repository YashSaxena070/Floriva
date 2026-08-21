# 🌱 Plantify — AI Plant Identification & Clinical Care Ecosystem

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB.svg?logo=react&logoColor=black)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo_SDK-54.0-000020.svg?logo=expo&logoColor=white)](https://expo.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2.0-FF6B6B.svg?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq_LPU-Vision_%26_LLM-F55036.svg)](https://groq.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Alpine-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Plantify** is an enterprise-grade botanical intelligence and plant health management platform. Powered by an autonomous **LangGraph multi-agent vision pipeline**, **Groq LPU vision acceleration**, **Pl@ntNet neural taxonomy**, and an **offline-first React Native (Expo) architecture**, Plantify provides species identification, clinical pathology diagnostics, personalized care regimens, and verified pharmaceutical product fulfillment with human-in-the-loop governance.

---

## 📑 Table of Contents

- [🌟 Key Platform Capabilities](#-key-platform-capabilities)
- [🏗 System Architecture & Monorepo Structure](#-system-architecture--monorepo-structure)
- [🔄 Deep-Dive AI & Data Pipelines](#-deep-dive-ai--data-pipelines)
  - [1. Autonomous Vision & Diagnostics LangGraph Pipeline](#1-autonomous-vision--diagnostics-langgraph-pipeline)
  - [2. Conversational Plant Memory Chat Agent](#2-conversational-plant-memory-chat-agent)
  - [3. Deterministic 7-Step Product Recommendation Pipeline](#3-deterministic-7-step-product-recommendation-pipeline)
  - [4. Offline-First Mobile Synchronization & Smart Notification Flow](#4-offline-first-mobile-synchronization--smart-notification-flow)
- [💻 Tech Stack Matrix](#-tech-stack-matrix)
- [🗄 Database Architecture & ERD](#-database-architecture--erd)
- [🔌 REST API Specification & Router Reference](#-rest-api-specification--router-reference)
- [⚙️ Environment Variables & Configuration](#️-environment-variables--configuration)
- [🚀 Quick Start & Local Setup](#-quick-start--local-setup)
  - [Prerequisites](#prerequisites)
  - [One-Click Automated Startup](#one-click-automated-startup)
  - [Manual Step-by-Step Setup](#manual-step-by-step-setup)
- [🧪 Testing & Quality Assurance](#-testing--quality-assurance)
- [🛡️ Production Deployment & Hardening Checklist](#️-production-deployment--hardening-checklist)
- [📄 License & Authors](#-license--authors)

---

## 🌟 Key Platform Capabilities

- **Multi-Modal Botanical Recognition**: High-precision taxonomic classification with multi-candidate confidence scoring via Pl@ntNet API.
- **Clinical Disease & Pathology Diagnostics**: Groq LPU-accelerated Vision models (`llama-3.2-11b-vision-preview` / `llama-3.2-90b-vision-preview`) detecting foliar pathogens, nutrient deficiencies, pest vectors, and hydration anomalies.
- **Context-Aware Plant Memory**: Historical health trajectory tracking with 10-scan retrospective trend analysis per specimen.
- **Autonomous Multi-Agent LangGraph Engine**: Stateful DAG workflow with image quality validation, dynamic branch routing, and recovery loops.
- **Human-In-The-Loop (HITL) Commerce**: Safe, policy-governed cart modification with state interrupt and user confirmation checkpoints.
- **Interactive Conversational Botanist**: Stateful AI assistant utilizing bound database tools to provide hallucination-free advice.
- **Offline-First Client Cache**: Local SQLite storage engine syncing garden states, botanical sheets, and dynamic care notifications.
- **Smart Adaptive Scheduling**: Dynamic watering, sunlight, and fertilization alarms computed from localized climate heuristics.

---

## 🏗 System Architecture & Monorepo Structure

```
Plantify/
├── Plantify_UI/                     # Cross-Platform React Native (Expo) Application
│   ├── app/                         # Expo Router (v6) file-based screens & tab routing
│   │   ├── (tabs)/                  # Bottom Tab Navigation Hub
│   │   │   ├── index.tsx            # Home dashboard (Garden status, Quick actions, Weather tips)
│   │   │   ├── care.tsx             # Interactive daily care tasks & smart watering schedules
│   │   │   ├── my-garden.tsx        # User's digital plant collection & health badges
│   │   │   └── profile.tsx          # Account settings, sync stats, push preferences
│   │   ├── index.tsx                # Dynamic splash & authentication landing gate
│   │   ├── login.tsx / register.tsx # JWT & Google OAuth authentication screens
│   │   ├── location-permission.tsx  # Geo-permission onboarding for climate-adjusted care
│   │   ├── camera.tsx               # High-speed camera viewfinder with plant alignment overlay
│   │   ├── upload-photo.tsx         # Gallery upload picker with image quality guidelines
│   │   ├── ai-analysis.tsx          # Real-time multi-stage AI pipeline progress visualizer
│   │   ├── plant-details.tsx        # 7-dimension botanical sheet, health history, care logs
│   │   ├── disease-detection-result.tsx # Pathology report & clinical diagnosis card
│   │   ├── recommended-products.tsx # Filtered therapeutic products & 1-click cart addition
│   │   └── cart.tsx                 # Cart management, checkout overview, treatment linkage
│   ├── components/                  # Design System UI components, SVG icons, animated cards
│   ├── services/                    # Axios API clients, SQLite cache layer, push notifications
│   ├── database/                    # Offline SQLite tables, sync queues, schema migrations
│   └── constants/                   # Colors, typography tokens, layout metrics, theme configs
│
├── backend/                         # High-Performance FastAPI (Python 3.11+) Backend
│   ├── app/
│   │   ├── ai/                      # Multi-Agent LangGraph Workflows & AI Intelligence
│   │   │   ├── agents/              # Tool-calling specialized agents (ProductRecommendationAgent)
│   │   │   ├── graph/               # LangGraph DAGs (Scan Pipeline, Chat Agent, State, Nodes)
│   │   │   ├── providers/           # API integration adapters (Pl@ntNet, Groq Vision, Groq Care)
│   │   │   ├── schemas/             # Pydantic schemas for AI inputs, outputs, structured JSON
│   │   │   ├── services/            # Clinical domain services & Botanical Knowledge Base
│   │   │   └── tools/               # LangChain executable database tools (DB = Truth)
│   │   ├── config/                  # Pydantic BaseSettings, PostgreSQL & Redis connection pools
│   │   ├── dependencies/            # FastAPI dependency injection (JWT auth, DB session)
│   │   ├── middleware/              # Global CORS, request logging, structured error handling
│   │   ├── models/                  # SQLAlchemy 2.0 ORM entities (User, Plant, Scan, Product, Cart)
│   │   ├── repositories/            # Clean Data Access Layer (DAL) abstractions
│   │   ├── routers/                 # Modular API endpoints (Auth, Plants, Scans, Products, Cart, Chat)
│   │   ├── schemas/                 # Strict Pydantic v2 validation & response contracts
│   │   └── scripts/                 # Database seeders (Products, Categories, Botanical defaults)
│   ├── alembic/                     # Database versioning & schema migration scripts
│   ├── tests/                       # Pytest test suite (66+ passing unit and integration tests)
│   └── docker-compose.yml           # PostgreSQL 16 (Port 5434) & Redis (Port 6379) orchestration
│
├── package.json                     # Monorepo root workspace orchestrator
├── start-all.ps1                    # One-click Windows PowerShell dev environment launcher
└── start-all.sh                     # One-click Unix / macOS bash dev environment launcher
```

---

## 🔄 Deep-Dive AI & Data Pipelines

Plantify decouples raw model inference from business logic using strict validation boundaries and structured agent graphs.

### 1. Autonomous Vision & Diagnostics LangGraph Pipeline

The primary scan pipeline processes plant imagery through a state machine featuring **quality gating**, **confidence-based routing**, **retrospective memory synthesis**, and **Human-in-the-Loop (HITL)** interruption.

```mermaid
flowchart TD
    Start([🚀 User Uploads Photo]) --> LoadContext[🧠 load_plant_context<br/><i>Fetch Past 10 Scans & Health Trajectory</i>]
    LoadContext --> ImgVal[🔍 image_validation<br/><i>Resolution, Contrast, Specimen Check</i>]
    
    ImgVal -- Quality Failed --> LowImg[⚠️ request_better_image]
    LowImg --> EndLow([🛑 Pipeline Terminated])
    
    ImgVal -- Quality Passed --> PlantID[🌿 plant_identification<br/><i>Pl@ntNet Neural Vision API</i>]
    
    PlantID -- Confidence < 0.40 --> LowImg
    PlantID -- Confidence >= 0.40 --> Health[🩺 health_analysis<br/><i>Groq Vision Llama-3.2 Diagnostic</i>]
    
    Health -- Health Unknown / Low Conf --> LowImg
    Health -- Pathology Assessed --> PlantAnalysis[📋 plant_analysis<br/><i>Curated Knowledge Base Synthesis</i>]
    
    PlantAnalysis --> TreatDecision{💊 treatment_decision<br/><i>Pathology Requires Intervention?</i>}
    
    TreatDecision -- No / Healthy --> HealthyEnd([✅ Completed: Care Regimen Generated])
    
    TreatDecision -- Yes / Diseased --> ProdRec[🤖 product_recommendation<br/><i>LangChain Tool-Calling Agent</i>]
    
    ProdRec --> CartDecision{🛒 cart_decision<br/><i>Prescribe Direct Medication?</i>}
    
    CartDecision -- No Product Available --> HealthyEnd
    CartDecision -- cart_action = 'add' --> HumanInterrupt{{⏸️ human_confirmation<br/><b>HITL Interrupt Point</b>}}
    
    HumanInterrupt -- User Approves --> AddCart[📦 add_to_cart<br/><i>Atomic DB Transaction</i>]
    HumanInterrupt -- User Declines --> HealthyEnd
    AddCart --> FinalEnd([🎉 Pipeline Finalized])

    style HumanInterrupt fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
    style PlantID fill:#d1e7dd,stroke:#198754,stroke-width:2px;
    style Health fill:#d1e7dd,stroke:#198754,stroke-width:2px;
    style ProdRec fill:#cfe2ff,stroke:#0d6efd,stroke-width:2px;
```

#### Pipeline State & Routing Logic:
1. **`load_plant_context`**: Queries historical database records (past scans, symptoms, recurring diseases, previous treatments) and populates `PlantifyGraphState`.
2. **`image_validation`**: Validates file integrity, dimensions, aspect ratio, and absence of severe blur or corruption.
3. **`plant_identification`**: Matches against Pl@ntNet API taxonomy database, extracting common name, scientific name, and candidate ranking.
4. **`health_analysis`**: Evaluates foliar damage, spot patterns, color distortion, and pest vectors using Groq Vision API.
5. **`plant_analysis`**: Injects curated botanical domain profiles (e.g. Araceae, Cactaceae, Asparagaceae) into Groq LLM to yield 7 care dimensions (Watering, Light, Temp, Humidity, Soil, Fertilizer, Pruning).
6. **`treatment_decision`**: Evaluates disease severity (`low`, `medium`, `high`, `critical`) and determines if pharmaceutical treatment is mandatory.
7. **`product_recommendation`**: Triggers `ProductRecommendationAgent` with tool-calling bindings to query real in-stock database products.
8. **`human_confirmation` (Checkpointed Interrupt)**: Graph halts via `MemorySaver`. The frontend displays the proposed cart action. Upon user confirmation, graph resumes to execute `add_to_cart`.

---

### 2. Conversational Plant Memory Chat Agent

The botanical conversational assistant (`PlantifyChatGraph`) enables users to query their plant's condition conversationally with strict zero-hallucination guarantees.

```mermaid
sequenceDiagram
    autonumber
    actor User as 📱 Mobile Client
    participant Router as ⚡ FastAPI ai_chat
    participant Graph as 🧭 LangGraph Chat Agent
    participant LLM as ⚡ Groq LLM
    participant Tools as 🛠️ DB Plant Tools
    participant DB as 🐘 PostgreSQL

    User->>Router: POST /api/chat {plant_id, question}
    Router->>Graph: run_chat(user_id, plant_id, question)
    Graph->>LLM: System Prompt + Plant Context + Tool Definitions
    LLM->>Graph: Tool Call: get_plant_history(plant_id)
    Graph->>Tools: Execute get_plant_history()
    Tools->>DB: Query Plant, Scans, Health, Care, Cart
    DB-->>Tools: Complete Longitudinal Records
    Tools-->>Graph: Return Serialized Context JSON
    Graph->>LLM: Tool Response Injection
    LLM->>Graph: Tool Call (Optional): search_plant_knowledge(issue)
    Graph->>Tools: Query Botanical Care Protocols
    Tools-->>Graph: Return Curated Baseline Data
    Graph->>LLM: Final Synthesis Prompt
    LLM-->>Graph: Formatted Botanical Advice
    Graph-->>Router: Final Response & Reasoning Traces
    Router-->>User: 200 OK {response, tool_calls, trace}
```

> **Design Principle — Database as Truth, LLM as Reasoning**: The language model is strictly prohibited from inventing plant histories, diseases, product prices, or SKU identifiers. All facts are queried via bound SQL tools.

---

### 3. Deterministic 7-Step Product Recommendation Pipeline

When an active botanical infection or deficiency is diagnosed, the recommendation pipeline filters and scores real products from the catalog.

```mermaid
flowchart LR
    In([Clinical Pathology Data]) --> S1[1. CategoryResolver<br/><i>Map issue to product category</i>]
    S1 --> S2[2. ProductQuery<br/><i>Fetch active SKUs from DB</i>]
    S2 --> S3[3. CompatibilityFilter<br/><i>Filter species & issue match</i>]
    S3 --> S4[4. AvailabilityFilter<br/><i>Verify in-stock inventory</i>]
    S4 --> S5[5. PriceRanker<br/><i>Classify Budget, Mid, Premium</i>]
    S5 --> S6[6. RelevanceScorer<br/><i>Compute weighted match score</i>]
    S6 --> S7[7. ResultBuilder<br/><i>Generate clinical rationale</i>]
    S7 --> Out([Structured Recommendations])
```

- **Step 1: CategoryResolver**: Maps AI diagnosis (e.g. `fungal_disease`, `pest_infestation`, `nutrient_deficiency`) to database category slugs (`fungicide`, `insecticide`, `fertilizer`, `soil`).
- **Step 2: ProductQuery**: Selects candidate items from PostgreSQL.
- **Step 3: CompatibilityFilter**: Verifies product formulation compatibility with specific plant species.
- **Step 4: AvailabilityFilter**: Excludes zero-inventory or inactive products.
- **Step 5: PriceRanker**: Segments candidates into `budget`, `mid-tier`, and `premium` cohorts.
- **Step 6: RelevanceScorer**: Computes a continuous relevance coefficient based on ingredient potency and symptom overlap.
- **Step 7: ResultBuilder**: Emits `best_recommendation`, `budget_alternative`, and `premium_alternative` along with clinical usage instructions.

---

### 4. Offline-First Mobile Synchronization & Smart Notification Flow

Plantify maintains full operational capability in low-connectivity garden environments through local SQLite caching and background push alarms.

```mermaid
flowchart TD
    subgraph MobileDevice [📱 Mobile Device - Offline First]
        UI[Expo React Native UI]
        SQLite[(Local SQLite DB)]
        NotifService[Expo Notifications]
        LocationService[Expo Location Service]
    end

    subgraph CloudBackend [☁️ Plantify Cloud Services]
        FastAPI[FastAPI Gateway]
        Postgres[(PostgreSQL 16)]
        WeatherAPI[OpenWeather API]
    end

    UI <--> SQLite
    LocationService -->|Fetch Coordinates| WeatherAPI
    WeatherAPI -->|Dynamic Temperature & Humidity| UI
    UI -->|Compute Adjusted Hydration Interval| NotifService
    NotifService -->|Trigger Local Scheduled Alarm| UserDevice([🔔 Watering / Care Alarm])
    
    UI -->|Online Sync Queue| FastAPI
    FastAPI <--> Postgres
```

---

## 💻 Tech Stack Matrix

| Domain | Technology | Version | Purpose |
|---|---|---|---|
| **Mobile Frontend** | React Native | `0.81.5` | Cross-platform native mobile application (iOS & Android) |
| **App Framework** | Expo SDK | `~54.0.34` | Unified runtime, camera, push notifications & sensors |
| **Routing** | Expo Router | `~6.0.23` | File-system based type-safe routing & deep linking |
| **Client Storage** | Expo SQLite | `~16.0.10` | Offline-first relational cache for plants and care plans |
| **Animation** | React Native Reanimated | `~4.1.1` | 60 FPS smooth gestures, transitions, and loading states |
| **Backend API** | FastAPI | `0.115.0` | Asynchronous Python REST framework with auto OpenAPI |
| **AI Orchestration**| LangGraph & LangChain | `>=0.2.0` | Stateful multi-agent cyclical graphs with checkpointing |
| **Vision & LLM** | Groq LPU SDK | `>=0.37.0` | Sub-second visual pathology diagnostics & care reasoning |
| **Plant Vision** | Pl@ntNet API | `v2` | World-leading botanical neural taxonomic identification |
| **ORM & Database** | SQLAlchemy & Alembic | `2.0.35` | Schema definition, connection pooling, and migrations |
| **Primary Database**| PostgreSQL | `16-Alpine` | ACID-compliant relational data store on Port `5434` |
| **Cache & Tasks** | Redis | `7-Alpine` | Session caching & asynchronous queue infrastructure |
| **Validation** | Pydantic v2 | `2.9.2` | Strict runtime typing and serialization validation |

---

## 🗄 Database Architecture & ERD

```mermaid
erDiagram
    USERS ||--o{ PLANTS : owns
    USERS ||--o{ CARTS : maintains
    PLANTS ||--o{ PLANT_SCANS : contains
    PLANTS ||--o{ PLANT_IMAGES : archives
    PLANT_SCANS ||--o| IDENTIFICATION_RESULTS : produces
    PLANT_SCANS ||--o| HEALTH_ANALYSES : diagnoses
    PLANT_SCANS ||--o| CARE_RECOMMENDATIONS : generates
    CARE_RECOMMENDATIONS ||--o{ RECOMMENDED_PRODUCTS : suggests
    PRODUCTS ||--o{ RECOMMENDED_PRODUCTS : references
    CARTS ||--o{ CART_ITEMS : contains
    PRODUCTS ||--o{ CART_ITEMS : includes

    USERS {
        uuid id PK
        string email UK
        string hashed_password
        string full_name
        string avatar_url
        datetime created_at
    }

    PLANTS {
        uuid id PK
        uuid user_id FK
        string name
        string scientific_name
        string location
        string primary_image_url
        datetime created_at
    }

    PLANT_SCANS {
        uuid id PK
        uuid plant_id FK
        string image_url
        string scan_type
        string status
        datetime created_at
    }

    IDENTIFICATION_RESULTS {
        uuid id PK
        uuid scan_id FK
        string common_name
        string scientific_name
        float confidence
        jsonb raw_candidates
    }

    HEALTH_ANALYSES {
        uuid id PK
        uuid scan_id FK
        string health_status
        string issue_name
        float confidence
        string severity
        jsonb symptoms
        jsonb possible_causes
    }

    CARE_RECOMMENDATIONS {
        uuid id PK
        uuid scan_id FK
        jsonb care_dimensions
        jsonb treatment_plan
        boolean treatment_required
    }

    PRODUCTS {
        uuid id PK
        string name
        string category
        float price
        integer stock
        string image_url
        string active_ingredients
        jsonb compatible_species
        jsonb compatible_issues
    }

    CARTS {
        uuid id PK
        uuid user_id FK
        datetime updated_at
    }

    CART_ITEMS {
        uuid id PK
        uuid cart_id FK
        uuid product_id FK
        integer quantity
        uuid scan_id FK
    }
```

---

## 🔌 REST API Specification & Router Reference

The backend exposes fully typed REST endpoints documented interactively via Swagger UI at `/docs`.

### Authentication Router (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new account with email/password | No |
| `POST` | `/api/auth/login` | Authenticate user and issue JWT Bearer token | No |
| `POST` | `/api/auth/google` | Verify Google OAuth2 ID token and login/register | No |
| `GET` | `/api/auth/me` | Fetch currently authenticated user profile | Yes (Bearer) |

### Plants Router (`/api/plants`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/plants` | Create new digital plant entry in user's garden | Yes (Bearer) |
| `GET` | `/api/plants` | List all plants owned by current user | Yes (Bearer) |
| `GET` | `/api/plants/{plant_id}` | Retrieve individual plant profile & metadata | Yes (Bearer) |
| `PATCH` | `/api/plants/{plant_id}` | Update plant name, location, or notes | Yes (Bearer) |
| `DELETE` | `/api/plants/{plant_id}` | Delete plant and all associated scan history | Yes (Bearer) |
| `GET` | `/api/plants/{plant_id}/health-timeline` | Retrieve historical health trajectory scores | Yes (Bearer) |

### Scans & AI Vision Router (`/api/scans` & `/api/plants/{plant_id}`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/plants/{plant_id}/scans` | Upload image and create pending scan record | Yes (Bearer) |
| `POST` | `/api/plants/{plant_id}/identify` | Run Pl@ntNet vision identification + Groq health | Yes (Bearer) |
| `GET` | `/api/plants/{plant_id}/scans` | List all historical scans for a specific plant | Yes (Bearer) |
| `GET` | `/api/scans/{scan_id}` | Get full scan detail, identification & health report | Yes (Bearer) |
| `POST` | `/api/scans/{scan_id}/health-analysis` | Trigger dedicated Groq visual pathology diagnosis | Yes (Bearer) |
| `POST` | `/api/scans/{scan_id}/analyze` | Generate 7-dimension care & treatment analysis | Yes (Bearer) |
| `GET` | `/api/scans/{scan_id}/recommendation` | Fetch saved care & treatment recommendation | Yes (Bearer) |
| `POST` | `/api/scans/{scan_id}/pipeline` | Run End-to-End LangGraph Multi-Agent Pipeline | Yes (Bearer) |

### Conversational Botanist Chat (`/api/chat`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/chat` | Query AI Botanist with plant memory & DB tool calling | Yes (Bearer) |

### Products & Smart Cart Router (`/api/products` & `/api/cart`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/products` | Query products catalog with filters & search | No |
| `GET` | `/api/products/{product_id}` | Retrieve detailed product specification & stock | No |
| `GET` | `/api/products/category/{category}` | List products under specific category slug | No |
| `GET` | `/api/cart` | Get current active user shopping cart & total | Yes (Bearer) |
| `POST` | `/api/cart/items` | Add product item to cart | Yes (Bearer) |
| `PATCH` | `/api/cart/items/{item_id}` | Modify cart item quantity | Yes (Bearer) |
| `DELETE` | `/api/cart/items/{item_id}` | Remove item from cart | Yes (Bearer) |
| `POST` | `/api/cart/approve/{scan_id}` | HITL approval: Execute recommended cart prescription | Yes (Bearer) |

---

## ⚙️ Environment Variables & Configuration

### 1. Backend Configuration (`backend/.env`)

Create `backend/.env` (copy from `backend/.env.example`):

```ini
# ── Server & Database ─────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/plantify
CLIENT_URL=http://localhost:8081

# ── JWT Authentication ───────────────────────────────────────
JWT_SECRET=super-secret-key-change-in-production-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# ── Google OAuth2 Server Verification ────────────────────────
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ── External AI & Botanical APIs ─────────────────────────────
PLANTNET_API_KEY=your_plantnet_api_key_here
GROQ_API_KEY=gsk_your_groq_api_key_here
WEATHER_API_KEY=your_openweather_api_key_here
PERENUAL_API_KEY=your_perenual_api_key_optional

# ── Storage & Task Infrastructure ────────────────────────────
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10
REDIS_URL=redis://localhost:6379/0
```

### 2. Frontend Configuration (`Plantify_UI/.env`)

Create `Plantify_UI/.env`:

```ini
# Backend API Base URL (Use LAN IP e.g. http://192.168.1.50:8000 for Physical Devices)
EXPO_PUBLIC_API_URL=http://localhost:8000

# Google OAuth Web Client ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
```

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher ([Download](https://nodejs.org))
- **Python**: 3.11+ ([Download](https://python.org))
- **Docker Desktop**: Running Docker daemon ([Download](https://www.docker.com))
- **Expo Go App** (Optional, for running on physical iOS/Android device)

---

### One-Click Automated Startup

We provide automated launch scripts that spin up Docker containers, apply database migrations, seed product catalogs, and start both Backend and Frontend dev servers concurrently.

#### Windows (PowerShell):
```powershell
.\start-all.ps1
```
*Or via npm root script:*
```powershell
npm run dev
```

#### macOS / Linux (Bash):
```bash
chmod +x ./start-all.sh
./start-all.sh
```

---

### Manual Step-by-Step Setup

#### Step 1: Start Containerized Database & Cache
```bash
cd backend
docker-compose up -d
```
*PostgreSQL will be available on `localhost:5434` and Redis on `localhost:6379`.*

#### Step 2: Set Up Python Backend Virtual Environment
```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Step 3: Run Database Migrations & Seeders
```bash
# Apply Alembic schema migrations to PostgreSQL
alembic upgrade head

# Seed initial therapeutic products and category catalog
python -m app.scripts.seed_products
```

#### Step 4: Launch FastAPI Backend Server
```bash
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```
- **API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check Endpoint**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

#### Step 5: Start Expo Mobile / Web Application
Open a new terminal window:
```bash
cd Plantify_UI
npm install
npm run start
```
- Press `w` in terminal to launch in **Web Browser**.
- Press `a` to open in **Android Emulator**.
- Press `i` to open in **iOS Simulator** (macOS only).
- Scan the printed QR code with **Expo Go** on your physical phone.

---

## 🧪 Testing & Quality Assurance

Plantify includes comprehensive test suites covering unit and integration testing across authentication, computer vision adapters, LangGraph agents, and tool-calling execution.

### Run Backend Pytest Suite:
```powershell
# From root directory:
npm run test:backend

# Or directly in backend:
cd backend
pytest tests/ -v
```
> **Test Coverage**: 66+ passing test cases validating Auth tokens, Pl@ntNet mocks, Groq health responses, LangGraph StateGraph edges, Cart atomicity, and Repository DALs.

### Run Frontend Static Type Verification:
```powershell
npm run test:frontend
```

### Run Full Monorepo Test Suite:
```powershell
npm run test
```

---

## 🛡️ Production Deployment & Hardening Checklist

When moving Plantify to production (e.g. AWS ECS, GCP Cloud Run, Kubernetes, or Render/Railway):

1. **Security & Secrets**:
   - [ ] Generate a high-entropy 64-character string for `JWT_SECRET`.
   - [ ] Ensure all API keys (`GROQ_API_KEY`, `PLANTNET_API_KEY`) are managed via AWS Secrets Manager or GCP Secret Manager.
   - [ ] Enforce HTTPS termination and restrict CORS `CLIENT_URL` to the production domain.
2. **Database Hardening**:
   - [ ] Replace `MemorySaver` in LangGraph with a persistent PostgreSQL checkpointer (`PostgresSaver`).
   - [ ] Set `pool_size=20`, `max_overflow=10`, and `pool_pre_ping=True` on SQLAlchemy engine.
   - [ ] Enable automated daily WAL-backed PostgreSQL backups.
3. **Storage & Assets**:
   - [ ] Switch `UPLOAD_DIR` local disk storage to Amazon S3 or Google Cloud Storage using presigned URLs.
   - [ ] Serve static media assets through a low-latency CloudFront or Cloudflare CDN.
4. **Reliability & Rate Limiting**:
   - [ ] Implement Redis-backed rate limiting on `/api/plants/{id}/identify` and `/api/chat` endpoints.
   - [ ] Deploy Celery workers with Redis broker for asynchronous background processing of heavy multi-image batches.

---

## 📄 License & Authors

Distributed under the **MIT License**. See `LICENSE` for more information.

- **Lead Architect & Developer**: Yash Saxena ([@YashSaxena070](https://github.com/YashSaxena070))
- **Project**: Plantify — AI Plant Identifier & Clinical Care Assistant

---
<p align="center">
  Built with 💚 for plant enthusiasts and botanical researchers worldwide.
</p>
