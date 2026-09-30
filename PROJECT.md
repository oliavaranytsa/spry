# Spry — Repository Specification (PROJECT.md)

## 1. Repository Layout & Folder Purposes

```text
spry/
├── backend/                  # FastAPI REST API, SQLAlchemy models, Alembic migrations
│   ├── alembic/              # Database migration scripts
│   ├── alembic.ini           # Alembic configuration
│   ├── app/
│   │   ├── api/              # API router endpoints (/api/meetings, /api/health)
│   │   ├── core/             # Database connection, settings, engine
│   │   ├── models/           # SQLAlchemy ORM models (Meeting)
│   │   └── schemas/          # Pydantic schemas for request/response validation
│   ├── Dockerfile            # Container definition pinned to python:3.12-slim
│   └── requirements.txt      # Pinned Python package dependencies
├── frontend/                 # React SPA (Vite, Tailwind CSS, shadcn/ui)
│   ├── src/
│   │   ├── components/       # shadcn/ui components, MeetingForm, MeetingList
│   │   ├── lib/              # API client and utility helpers
│   │   ├── App.tsx           # Single-page interface (list meetings + create form)
│   │   └── main.tsx          # React application entry point
│   ├── Dockerfile            # Container definition pinned to node:20-alpine
│   ├── package.json          # Pinned frontend dependencies
│   ├── tailwind.config.js    # Tailwind configuration
│   └── vite.config.ts        # Vite build tool and API proxy config
├── docs/                     # Architectural decision records
│   └── decisions.md          # Monorepo architecture decision
├── docker-compose.yml        # Local orchestration (PostgreSQL, backend, frontend)
├── Makefile                  # Developer and deployment automation targets
└── PROJECT.md                # System specification and architecture contracts
```

## 2. Pinned Versions
- **Base Images**:
  - Python: `python:3.12-slim`
  - Node.js: `node:20-alpine`
  - PostgreSQL: `postgres:16-alpine`
- **Backend Stack**:
  - `fastapi==0.110.0`
  - `uvicorn==0.28.0`
  - `sqlalchemy==2.0.28`
  - `alembic==1.13.1`
  - `psycopg2-binary==2.9.9`
  - `pydantic==2.6.4`
- **Frontend Stack**:
  - `react@18.2.0`
  - `vite@5.1.6`
  - `tailwindcss@3.4.1`
  - `lucide-react@0.358.0`

## 3. Strict API Contracts

### Meeting Schema
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "title": "Design Review",
  "starts_at": "2026-10-01T10:00:00Z",
  "ends_at": "2026-10-01T11:00:00Z",
  "attendee_count": 4
}
```

### Endpoints
1. **`GET /api/meetings`**
   - **Method**: `GET`
   - **Description**: Returns all scheduled meetings sorted by `starts_at` ascending.
   - **Response**: `200 OK`
     - Body: Array of `Meeting` objects:
       ```json
       [
         {
           "id": "string (UUID)",
           "title": "string",
           "starts_at": "string (ISO 8601, UTC)",
           "ends_at": "string (ISO 8601, UTC)",
           "attendee_count": 4
         }
       ]
       ```

2. **`POST /api/meetings`**
   - **Method**: `POST`
   - **Description**: Creates a new meeting.
   - **Request Body**:
     ```json
     {
       "title": "string (min 1, max 255)",
       "starts_at": "string (ISO 8601)",
       "ends_at": "string (ISO 8601)",
       "attendee_count": 1
     }
     ```
   - **Validation Rules**:
     - `title`: cannot be empty.
     - `starts_at` and `ends_at`: must be valid ISO 8601 date-time strings.
     - `ends_at` must be strictly later than `starts_at`.
     - `attendee_count`: integer >= 1.
   - **Response**: `201 Created`
     - Body: Created `Meeting` object with server-generated `id`.

3. **`GET /api/health`**
   - **Method**: `GET`
   - **Response**: `200 OK` (`{"status": "healthy"}`)

## 4. Docker Compose Services & Readiness Order

- **`postgres`**:
  - Image: `postgres:16-alpine`
  - Internal port: `5432`
  - Healthcheck:
    - Test: `pg_isready -U postgres -d spry`
    - Interval: `5s`, Timeout: `5s`, Retries: `5`
- **`backend`**:
  - Build context: `./backend`
  - Port mapping: `8000:8000`
  - Environment: `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/spry`
  - Dependency: `postgres` with `condition: service_healthy` (ensures PostgreSQL is accepting queries before backend starts)
  - Startup command: runs `alembic upgrade head` followed by `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- **`frontend`**:
  - Build context: `./frontend`
  - Port mapping: `5173:5173`
  - Dependency: `backend` with `condition: service_started`
