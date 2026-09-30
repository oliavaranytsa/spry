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
