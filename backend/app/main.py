from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import meetings


def create_app() -> FastAPI:
    app = FastAPI(
        title="Spry API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["health"], summary="Liveness probe")
    @app.get("/api/health", tags=["health"], summary="API health")
    async def health() -> dict[str, str]:
        return {"status": "healthy"}

    # Mount endpoints under /api/meetings and /meetings for flexible client access
    app.include_router(meetings.router, prefix="/api")
    app.include_router(meetings.router)
    return app


app = create_app()
